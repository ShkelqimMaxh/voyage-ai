#!/usr/bin/env python3
"""Headless drive emulator for the VoyageFM host loop.

Replays, against a live backend, exactly what the Expo client does on
"Demo drive": a location ticker walking a real road polyline, the throttled
reverse-geocoder, and `runHostForever` — opener clip, prefetch depth 2, the
serialized script mutex, the 25s/45s TTS deadlines, and back-to-back playback.

Playback length is the real thing: the WAV the backend returns is measured,
not guessed. Anything the host cannot fill is silence, and silence is what
this tool is for — it logs every clip the host said and every gap between
clips, and reports how many gaps ran over the threshold.

Usage:
  scripts/drive-emulator.py --route prishtina-skopje --minutes 20 \
      --base-url https://voyage-ai-production-967b.up.railway.app \
      --out /tmp/drive.jsonl
"""
from __future__ import annotations

import argparse
import asyncio
import io
import json
import math
import re
import sys
import time
import unicodedata
import wave
from dataclasses import dataclass, field
from pathlib import Path

import httpx

EARTH_M = 6_371_000.0
REPO = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------- geo helpers


def haversine_m(a, b) -> float:
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    d_lat = math.radians(b[0] - a[0])
    d_lon = math.radians(b[1] - a[1])
    h = math.sin(d_lat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(d_lon / 2) ** 2
    return 2 * EARTH_M * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def bearing_deg(a, b) -> float:
    y = math.sin(math.radians(b[1] - a[1])) * math.cos(math.radians(b[0]))
    x = math.cos(math.radians(a[0])) * math.sin(math.radians(b[0])) - math.sin(
        math.radians(a[0])
    ) * math.cos(math.radians(b[0])) * math.cos(math.radians(b[1] - a[1]))
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def point_along_route(route, t: float):
    """Port of core/geo.ts pointAlongRoute."""
    t = min(1.0, max(0.0, t))
    if not route:
        return (0.0, 0.0, 0.0)
    if len(route) == 1:
        return (route[0][0], route[0][1], 0.0)
    spans = [haversine_m(route[i], route[i + 1]) for i in range(len(route) - 1)]
    total = sum(spans) or 1.0
    remain = t * total
    for i, span in enumerate(spans):
        span = span or 1.0
        if remain <= span:
            f = remain / span
            lat = route[i][0] + (route[i + 1][0] - route[i][0]) * f
            lon = route[i][1] + (route[i + 1][1] - route[i][1]) * f
            return (lat, lon, bearing_deg(route[i], route[i + 1]))
        remain -= span
    return (route[-1][0], route[-1][1], bearing_deg(route[-2], route[-1]))


def village_key(place: dict) -> str:
    """Mirror of the client's placeKey(): reverse geocoding returns a different
    OSM node per fix, so repeat visits are keyed on the settlement name."""
    raw = re.split(r"[\u2013\u2014/,-]", place.get("name") or place.get("id") or "")[0].strip().lower()
    folded = unicodedata.normalize("NFKD", raw)
    return "".join(ch for ch in folded if ch.isalnum() or ch.isspace()).strip() or str(place.get("id"))


def pace_from_speed(speed_mps) -> str:
    kmh = (speed_mps or 0) * 3.6
    if kmh < 8:
        return "crawl"
    if kmh < 55:
        return "urban"
    if kmh < 80:
        return "rural"
    return "highway"


def load_route(name: str):
    """Read the waypoint list straight out of the app's own route module."""
    stem = "".join(part.capitalize() if i else part for i, part in enumerate(name.split("-")))
    path = REPO / "mobile" / "src" / "engine" / "location" / f"{stem}Road.ts"
    if not path.is_file():
        raise SystemExit(f"no route module at {path}")
    text = path.read_text()
    pts = [
        (float(lat), float(lon))
        for lat, lon in re.findall(r"latitude:\s*(-?[\d.]+),\s*longitude:\s*(-?[\d.]+)", text)
    ]
    if not pts:
        raise SystemExit(f"no waypoints parsed from {path}")
    return pts


# ------------------------------------------------------------------ app state

TOPIC_WHEEL = ["culture", "food", "history", "surprise"]
TOPIC_CYCLE = ["history", "landscape", "food", "culture", "geology", "road"]
PLACE_FIELDS = (
    "id name kind country region municipality city neighbourhood latitude longitude "
    "osm_id distance_m summary wikipedia_title wikipedia_extract road_name"
).split()


@dataclass
class Clip:
    index: int
    kind: str  # opener | clip
    place_name: str
    place_id: str
    topic: str
    title: str
    text: str
    source: str
    voice: str  # gemini | device-fallback
    audio_s: float
    start_s: float
    end_s: float
    gap_before_s: float
    script_latency_s: float
    tts_latency_s: float
    covered: str = ""
    duplicate: bool = False


@dataclass
class Emulator:
    base_url: str
    route: list
    duration_ms: int
    speed_mps: float
    gap_threshold_s: float = 5.0
    do_prefetch: bool = True
    seed_name: str = "Prishtina"
    route_id: str = "prishtina-skopje"

    started: float = 0.0
    client: httpx.AsyncClient = None  # type: ignore
    log: list = field(default_factory=list)
    clips: list = field(default_factory=list)
    events: list = field(default_factory=list)

    # client-side mirrors of the app's module state
    point: dict = None  # type: ignore
    context: dict = field(default_factory=lambda: {"current": None, "nearby": [], "region": None})
    weather: str = None  # type: ignore
    topic_index: int = 0
    last_topic: str = "surprise"
    previous_ids: list = field(default_factory=list)
    already_said: list = field(default_factory=list)
    script_cache: dict = field(default_factory=dict)  # (place_id, topic) -> script
    audio_cache: dict = field(default_factory=dict)  # script_id -> url
    said_here: dict = field(default_factory=dict)  # village key -> covered points
    covered_keys: list = field(default_factory=list)  # every point aired, drive-wide
    warmed: dict = field(default_factory=dict)  # url -> duration_s
    host_alive: bool = True
    route_done: bool = False
    last_audio_end: float = 0.0

    # geocoder throttle
    geo_last_at: float = 0.0
    geo_last_point: tuple = None  # type: ignore

    def now(self) -> float:
        return time.monotonic() - self.started

    def emit(self, _event: str, **fields):
        rec = {"t": round(self.now(), 2), "event": _event, **fields}
        self.log.append(rec)
        self.events.append(rec)
        self._append(rec)
        line = f"[{rec['t']:7.1f}s] {_event}"
        detail = " ".join(f"{k}={v}" for k, v in fields.items() if k not in {"text"})
        print(f"{line} {detail}"[:200], flush=True)

    # ---------------------------------------------------------------- network
    async def post(self, path: str, payload: dict) -> dict:
        r = await self.client.post(self.base_url + path, json=payload)
        r.raise_for_status()
        return r.json()

    async def with_deadline(self, coro, seconds: float):
        """withDeadline(): the request keeps running server-side, we stop waiting."""
        task = asyncio.ensure_future(coro)
        done, _ = await asyncio.wait({task}, timeout=seconds)
        if not done:
            raise asyncio.TimeoutError()
        return task.result()

    # ------------------------------------------------------- location + geo
    def publish_point(self, t: float) -> None:
        lat, lon, heading = point_along_route(self.route, t)
        self.point = {
            "latitude": lat,
            "longitude": lon,
            "heading": heading,
            "speed_mps": self.speed_mps,
        }

    async def resolve_context(self) -> None:
        """ReverseGeocoder.resolve — 12s throttle AND <0.002deg movement."""
        p = self.point
        now = time.monotonic()
        if (
            self.geo_last_point
            and now - self.geo_last_at < 12.0
            and abs(self.geo_last_point[0] - p["latitude"]) < 0.002
            and abs(self.geo_last_point[1] - p["longitude"]) < 0.002
        ):
            return
        t0 = time.monotonic()
        try:
            data = await self.post(
                "/v1/places/resolve",
                {"point": dict(p), "lookahead_seconds": 90},
            )
            self.context = {
                "current": data.get("current"),
                "nearby": data.get("nearby") or [],
                "region": data.get("region"),
                "source": data.get("source"),
            }
            self.geo_last_at = time.monotonic()
            self.geo_last_point = (p["latitude"], p["longitude"])
            cur = self.context["current"] or {}
            self.emit(
                "place",
                name=cur.get("name"),
                kind=cur.get("kind"),
                country=cur.get("country"),
                src=self.context.get("source"),
                took=round(time.monotonic() - t0, 1),
            )
        except Exception as exc:  # falls back to the offline knowledge pack in-app
            import traceback, os
            if os.environ.get("EMU_DEBUG"):
                traceback.print_exc()
            self.geo_last_at = time.monotonic()
            self.geo_last_point = (p["latitude"], p["longitude"])
            self.emit("place_error", error=f"{type(exc).__name__}: {exc}"[:160], took=round(time.monotonic() - t0, 1))

    async def location_ticker(self) -> None:
        """LocationEngine.startDemo: a point every 1500 ms, plus the point pump."""
        start = time.monotonic()
        self.publish_point(0.0)
        await self.resolve_context()
        while self.host_alive:
            t = min(1.0, (time.monotonic() - start) / (self.duration_ms / 1000))
            self.publish_point(t)
            await self.resolve_context()
            if t >= 1.0:
                self.route_done = True
                self.emit("route_complete")
                return
            await asyncio.sleep(1.5)

    # ------------------------------------------------------------- scripting
    def pick_place(self) -> dict:
        current = self.context.get("current")
        nearby = [n for n in (self.context.get("nearby") or []) if not current or n.get("id") != current.get("id")]
        if self.topic_index % 4 == 3 and nearby:
            return nearby[0]
        if current:
            return current
        p = self.point
        return {
            "id": f"on-the-road-{p['latitude']:.3f}-{p['longitude']:.3f}",
            "name": "this road",
            "kind": "road",
            "latitude": p["latitude"],
            "longitude": p["longitude"],
            "summary": "You are moving. Talk about what is actually around these coordinates — not another country.",
        }

    def next_wheel_topic(self) -> str:
        topic = TOPIC_WHEEL[self.topic_index % len(TOPIC_WHEEL)]
        self.topic_index += 1
        return topic

    def script_topic(self, requested: str) -> str:
        """ScriptService.nextTopic."""
        if requested != "surprise":
            self.last_topic = requested
            return requested
        idx = TOPIC_CYCLE.index(self.last_topic) if self.last_topic in TOPIC_CYCLE else -1
        nxt = TOPIC_CYCLE[(idx + 1) % len(TOPIC_CYCLE)]
        self.last_topic = nxt
        return nxt

    async def build_script(self, place: dict, wheel_topic: str) -> tuple:
        topic = self.script_topic(wheel_topic)
        skip_cache = bool(self.already_said)
        cached = self.script_cache.get((place.get("id"), topic))
        if cached and not skip_cache:
            return cached, 0.0
        body = {k: place.get(k) for k in PLACE_FIELDS}
        body["landmarks"] = place.get("landmarks") or []
        body["facts"] = place.get("facts") or []
        payload = {
            "place": body,
            "topic": topic,
            "pace": pace_from_speed(self.point.get("speed_mps")),
            "weather": self.weather,
            "locale": "en",
            "expand": False,
            "previous_place_ids": list(self.previous_ids),
            "already_said": list(self.already_said)[-3:],
            "already_covered_here": list(self.said_here.get(village_key(place), [])),
            "covered_keys": list(self.covered_keys)[-40:],
            "continuation": bool(self.already_said),
        }
        t0 = time.monotonic()
        script = await self.post("/v1/scripts/generate", payload)
        took = time.monotonic() - t0
        self.script_cache[(script.get("place_id"), script.get("topic"))] = script
        return script, took

    def remember_said(self, text: str) -> None:
        if not text or text in self.already_said:
            return
        self.already_said.append(text)
        if len(self.already_said) > 12:
            self.already_said.pop(0)

    # -------------------------------------------------------------- the voice
    async def resolve_audio(self, script: dict) -> tuple:
        """TtsService.resolveAudio + warmWebSpeech. Never raises."""
        sid = script["id"]
        if sid in self.audio_cache:
            url = self.audio_cache[sid]
            return url, 0.0
        total = 0.0
        for deadline in (25.0, 45.0):
            t0 = time.monotonic()
            try:
                data = await self.with_deadline(
                    self.post("/v1/tts/render", {"script_id": sid, "text": script["spoken_text"], "provider": "auto"}),
                    deadline,
                )
                total += time.monotonic() - t0
                url = data.get("audio_url")
                if url:
                    if not url.startswith("http"):
                        url = self.base_url + url
                    self.audio_cache[sid] = url
                    asyncio.ensure_future(self.warm(url))  # warmWebSpeech
                    return url, total
                return None, total  # backend has no cloud voice; retry won't help
            except Exception:
                total += time.monotonic() - t0
        return None, total

    async def warm(self, url: str) -> None:
        if url in self.warmed:
            return
        try:
            r = await self.client.get(url)
            if r.status_code != 200:
                return
            self.warmed[url] = wav_seconds(r.content)
        except Exception:
            pass

    async def audio_seconds(self, url: str) -> float:
        """playWebSpeech: use the warmed buffer, otherwise fetch and decode now."""
        if url in self.warmed:
            return self.warmed[url]
        r = await self.client.get(url)
        r.raise_for_status()
        seconds = wav_seconds(r.content)
        self.warmed[url] = seconds
        return seconds

    # ------------------------------------------------------------ host loop
    async def prepare_clip(self, place: dict, wheel_topic: str, mutex: asyncio.Semaphore) -> dict:
        async with mutex:  # enqueueScript: two lanes, like the client
            script, script_s = await self.with_deadline(self.build_script(place, wheel_topic), 60.0)
            self.remember_said(script["spoken_text"])
            # Carry the model's own one-line summary, like the client does.
            key = village_key(place)
            # The client counts a place as visited when the clip is queued, not
            # when it finishes playing. Recording it at play time left the first
            # `ahead` clips in a village all seeing times_here == 0, so each one
            # introduced the village again — the harness manufacturing exactly
            # the repetition it was measuring.
            self.previous_ids.append(key)
            if len(self.previous_ids) > 8:
                self.previous_ids.pop(0)
            thread = self.said_here.setdefault(key, [])
            point = (script.get("covered") or script["spoken_text"][:60]).strip()
            if point and point not in thread:
                thread.append(point)
                if len(thread) > 8:
                    thread.pop(0)
            if point and point not in self.covered_keys:
                self.covered_keys.append(point)
                if len(self.covered_keys) > 40:
                    self.covered_keys.pop(0)
            # Drop villages we have driven past; their thread is dead weight.
            live = set(self.previous_ids[-3:]) | {key}
            for gone in [k for k in self.said_here if k not in live]:
                del self.said_here[gone]
        url, tts_s = await self.resolve_audio(script)
        return {"script": script, "place": place, "url": url, "script_s": script_s, "tts_s": tts_s}

    async def play_clip(self, clip: dict, kind: str) -> None:
        script = clip["script"]
        url = clip["url"]
        if url:
            try:
                seconds = await self.audio_seconds(url)
                voice = "gemini"
            except Exception:
                seconds = device_speech_seconds(script["spoken_text"])
                voice = "device-fallback"
        else:
            seconds = device_speech_seconds(script["spoken_text"])
            voice = "device-fallback"

        start = self.now()
        gap = start - self.last_audio_end
        idx = len(self.clips) + 1
        self.emit(
            "speak",
            n=idx,
            place=clip["place"].get("name"),
            topic=script.get("topic"),
            voice=voice,
            audio_s=round(seconds, 1),
            gap_before_s=round(gap, 1),
        )
        await asyncio.sleep(seconds)  # the host is actually talking for this long
        end = self.now()
        self.last_audio_end = end
        self.clips.append(
            Clip(
                index=idx,
                kind=kind,
                place_name=clip["place"].get("name") or "",
                place_id=clip["place"].get("id") or "",
                topic=script.get("topic") or "",
                title=script.get("title") or "",
                text=script["spoken_text"],
                source=script.get("source") or "",
                voice=voice,
                audio_s=round(seconds, 2),
                start_s=round(start, 2),
                end_s=round(end, 2),
                gap_before_s=round(gap, 2),
                script_latency_s=round(clip["script_s"], 2),
                tts_latency_s=round(clip["tts_s"], 2),
                covered=str(script.get("covered") or ""),
                duplicate=bool(script.get("duplicate")),
            )
        )
        self._append({"event": "clip", **self.clips[-1].__dict__})
        self.remember_said(script["spoken_text"])
        # previous_ids is appended in prepare_clip, matching the client.

    async def run_host_forever(self) -> None:
        queue: list = []
        inflight = 0
        cooldown_until = 0.0
        ahead = 4
        mutex = asyncio.Semaphore(2)
        tasks: set = set()

        def prefetch():
            nonlocal inflight
            if time.monotonic() < cooldown_until:
                return
            while inflight + len(queue) < ahead and self.host_alive and not self.route_done:
                inflight += 1
                place = self.pick_place()
                wheel = self.next_wheel_topic()

                async def one(place=place, wheel=wheel):
                    nonlocal inflight, cooldown_until
                    try:
                        clip = await self.prepare_clip(place, wheel, mutex)
                        if self.host_alive:
                            queue.append(clip)
                    except Exception as exc:
                        cooldown_until = time.monotonic() + 4.0
                        self.emit("clip_error", error=f"{type(exc).__name__}: {exc}"[:120])
                    finally:
                        inflight -= 1

                task = asyncio.ensure_future(one())
                tasks.add(task)
                task.add_done_callback(tasks.discard)

        # opener: at most 8s for the cloud voice, then the device voice
        place = self.pick_place()
        draft = {
            "id": f"opener-{int(time.time() * 1000)}",
            "place_id": place.get("id"),
            "topic": "road",
            "title": "On air",
            "spoken_text": (
                f"VoyageFM. We're on the air. I'm with you through {place['name']}. Stay with me."
                if place.get("name") and place.get("name") != "this road"
                else "VoyageFM. We're on the air. I'm with you on this road. Stay with me."
            ),
            "duration_hint_s": 8,
            "source": "opener",
        }
        t0 = time.monotonic()
        try:
            url, tts_s = await self.with_deadline(self.resolve_audio(draft), 8.0)
        except Exception:
            url, tts_s = None, time.monotonic() - t0
        prefetch()
        await self.play_clip({"script": draft, "place": place, "url": url, "script_s": 0.0, "tts_s": tts_s}, "opener")

        prefetch()
        while self.host_alive:
            prefetch()
            while self.host_alive and not queue:
                if self.route_done and inflight == 0:
                    self.host_alive = False
                    return
                await asyncio.sleep(0.08)
                prefetch()
            if not queue:
                continue
            clip = queue.pop(0)
            prefetch()
            if clip["script"].get("duplicate") and queue:
                # Skipping is right when another clip is ready. Skipping into an
                # empty queue trades a mild repeat for dead air, which is the
                # worse of the two — 12 skips opened a 68s hole on the last drive.
                self.emit("skipped_duplicate", place=clip["place"].get("name"))
                continue
            await self.play_clip(clip, "clip")
            if self.route_done and not queue and inflight == 0:
                self.host_alive = False
                return

    # ------------------------------------------------------------------ side
    async def side_prefetch(self) -> None:
        """routeCache.prefetch() — fired on demo start, same as the app."""
        t0 = time.monotonic()
        try:
            data = await self.post(
                "/v1/prefetch/route",
                {
                    "polyline": [
                        {"latitude": lat, "longitude": lon, "heading": None, "speed_mps": self.speed_mps}
                        for lat, lon in self.route
                    ],
                    "topics": ["history", "landscape"],
                    "sample_meters": 1400,
                },
            )
            self.emit(
                "route_prefetch_done",
                places=len(data.get("places", [])),
                scripts=len(data.get("scripts", [])),
                took=round(time.monotonic() - t0, 1),
            )
        except Exception as exc:
            self.emit("route_prefetch_failed", error=f"{type(exc).__name__}: {exc}"[:160], took=round(time.monotonic() - t0, 1))

    async def side_weather(self) -> None:
        try:
            lat, lon = self.route[0]
            r = await self.client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={"latitude": lat, "longitude": lon, "current": "temperature_2m,weather_code,wind_speed_10m"},
            )
            cur = r.json().get("current") or {}
            if cur.get("temperature_2m") is not None:
                self.weather = f"{round(cur['temperature_2m'])}°C, wind {round(cur.get('wind_speed_10m') or 0)} km/h"
                self.emit("weather", value=self.weather)
        except Exception:
            pass

    out_path: Path = None  # type: ignore

    def _append(self, rec: dict) -> None:
        if not self.out_path:
            return
        with self.out_path.open("a") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

    async def run(self) -> None:
        self.started = time.monotonic()
        async with httpx.AsyncClient(timeout=httpx.Timeout(180.0), headers={"ngrok-skip-browser-warning": "1"}) as client:
            self.client = client
            self.emit("play_pressed", route_points=len(self.route), demo_minutes=round(self.duration_ms / 60000, 1))
            # startDemo() seeds the point and a placeholder place before the
            # host loop starts, so the opener has something to name.
            self.publish_point(0.0)
            self.context = {
                "current": {
                    "id": f"demo-start-{self.route_id}",
                    "name": self.seed_name,
                    "kind": "town",
                    "latitude": self.route[0][0],
                    "longitude": self.route[0][1],
                },
                "nearby": [],
                "region": None,
                "source": "knowledge",
            }
            if self.do_prefetch:
                asyncio.ensure_future(self.side_prefetch())
            asyncio.ensure_future(self.side_weather())
            ticker = asyncio.ensure_future(self.location_ticker())
            try:
                await self.run_host_forever()
            finally:
                self.host_alive = False
                ticker.cancel()
        self.emit("arrived")


PROPER_NAME = re.compile(r"\b([A-ZËÇ][\w\u00eb\u00e7'-]+(?:\s+[A-ZËÇ][\w\u00eb\u00e7'-]+){1,2})\b")
INTRO = re.compile(
    r"(?i)^\W*(?:alright,?\s+|okay,?\s+|so,?\s+|and\s+)?"
    r"(we(?:'| a)re (?:in|now in|now entering|entering|driving through)|"
    r"we've (?:just )?(?:come into|entered)|entering|this is|welcome to|here in|"
    r"as we (?:enter|come into)|passing through)\b"
)


def repetition_report(clips: list) -> dict:
    """The numbers every drive gets judged on, computed for us instead of by hand."""
    villages = [c.place_name for c in clips]
    village_names = list(dict.fromkeys(villages))
    intros = sum(1 for c in clips if INTRO.match(c.text.strip()))
    names: dict = {}
    for clip in clips:
        for name in set(PROPER_NAME.findall(clip.text)):
            names[name] = names.get(name, 0) + 1
    repeated = sorted(
        ((n, c) for n, c in names.items() if c > 1 and n not in village_names),
        key=lambda item: -item[1],
    )
    openings: dict = {}
    dupes = 0
    for clip in clips:
        key = " ".join(re.findall(r"[\w']+", clip.text.lower())[:5])
        if key and key in openings:
            dupes += 1
        openings[key] = True
    return {
        "intros": intros,
        "villages": len(village_names),
        "village_names": village_names,
        "repeated_names": repeated[:10],
        "repeated_openings": dupes,
        "people": len(names),
    }


def wav_seconds(data: bytes) -> float:
    with wave.open(io.BytesIO(data)) as w:
        return w.getnframes() / float(w.getframerate())


def device_speech_seconds(text: str) -> float:
    """expo-speech / speechSynthesis at rate 0.96, capped by the app's budget."""
    words = len(text.split())
    budget = min(90.0, max(10.0, words * 0.42))
    return min(budget, words / 2.7)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--route", default="prishtina-skopje")
    ap.add_argument("--base-url", default="https://voyage-ai-production-967b.up.railway.app")
    ap.add_argument("--minutes", type=float, default=20.0)
    ap.add_argument("--speed-mps", type=float, default=19.1)
    ap.add_argument("--gap-threshold", type=float, default=5.0)
    ap.add_argument("--no-route-prefetch", action="store_true")
    ap.add_argument("--seed-name", default="Prishtina")
    ap.add_argument("--out", default="drive.jsonl")
    args = ap.parse_args()

    route = load_route(args.route)
    emu = Emulator(
        base_url=args.base_url.rstrip("/"),
        route=route,
        duration_ms=int(args.minutes * 60_000),
        speed_mps=args.speed_mps,
        gap_threshold_s=args.gap_threshold,
        do_prefetch=not args.no_route_prefetch,
        seed_name=args.seed_name,
        route_id=args.route,
    )
    out = Path(args.out)
    out.write_text("")  # records are appended as they happen, so a stopped run is still readable
    emu.out_path = out
    try:
        asyncio.run(emu.run())
    except KeyboardInterrupt:
        pass

    out = Path(args.out)

    repeats = repetition_report(emu.clips)
    gaps = [c for c in emu.clips if c.gap_before_s > args.gap_threshold]
    talk = sum(c.audio_s for c in emu.clips)
    wall = emu.clips[-1].end_s if emu.clips else 0.0
    print("\n" + "=" * 70)
    print(f"clips spoken        : {len(emu.clips)}")
    print(f"wall clock          : {wall / 60:.1f} min")
    print(f"talking             : {talk / 60:.1f} min ({(talk / wall * 100) if wall else 0:.0f}%)")
    print(f"silence             : {(wall - talk) / 60:.1f} min")
    print(f"gaps > {args.gap_threshold:.0f}s          : {len(gaps)}")
    if gaps:
        longest = max(gaps, key=lambda c: c.gap_before_s)
        print(f"longest gap         : {longest.gap_before_s:.1f}s (before clip #{longest.index})")
        print(f"mean gap > {args.gap_threshold:.0f}s     : {sum(c.gap_before_s for c in gaps) / len(gaps):.1f}s")
    print(f"log                 : {out}")
    print("\n-- repetition --")
    print(f"introductions       : {repeats['intros']} (one per village is the target: {repeats['villages']})")
    print(f"villages            : {', '.join(repeats['village_names'])}")
    if repeats["repeated_names"]:
        print("names said more than once:")
        for name, count in repeats["repeated_names"]:
            print(f"    {name}: {count}x")
    else:
        print("names said more than once: none")
    if repeats["repeated_openings"]:
        print(f"clips opening like an earlier clip: {repeats['repeated_openings']}")
    print(f"distinct people named: {repeats['people']}")
    print(f"log                 : {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
