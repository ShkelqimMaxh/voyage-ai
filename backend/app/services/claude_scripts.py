from __future__ import annotations

import json
import re
import uuid

import httpx

from app.config import active_llm, get_settings
from app.knowledge import kosovo_dukagjini as knowledge
from app.models.schemas import DrivePace, NarrationScript, ScriptRequest, Topic
from app.prompts.narration import SCRIPT_SYSTEM, build_user_prompt
from app.services import cache

WORD_RATE = 2.5
JSON_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.S)
HOOKS = (
    ("rugova", "Rugova Canyon"),
    ("accursed", "Accursed Mountains"),
    ("proklet", "Accursed Mountains"),
    ("bjeshk", "Accursed Mountains"),
    ("peja beer", "Peja beer"),
    ("local beer", "Peja beer"),
    ("flija", "flija"),
    ("karst", "karst springs"),
    ("spring", "springs"),
    ("ottoman", "Ottoman mills or market recap"),
    ("patriarch", "Patriarchate"),
    ("unesco", "UNESCO"),
    ("sleeping beauty", "Sleeping Beauty Cave"),
    ("bukuroshja", "Sleeping Beauty Cave"),
    ("haxhi zeka", "Haxhi Zeka Mill"),
    ("dukagjini", "Dukagjini plain lecture"),
    ("two-lane", "the same two-lane road"),
    ("two lane", "the same two-lane road"),
    ("rural road", "the same rural road"),
    ("village limit", "village speed limits"),
    ("farm traffic", "farm traffic on this road"),
    ("no bypass", "no bypass"),
    ("leaving peja", "leaving Peja"),
    ("toward istog", "toward Istog"),
    ("towards istog", "toward Istog"),
    ("open field", "open fields along the road"),
    ("the corridor", "this corridor"),
    ("glimpse into", "generic village glimpse"),
    ("working village", "generic working-village section"),
    ("shared purpose", "generic shared purpose"),
    ("self-sufficient", "generic self-sufficient village"),
    ("generations have", "generic generations-on-the-soil"),
    ("farm implements", "generic farm-implements padding"),
)
GENERIC_FILLER = (
    "glimpse into",
    "working village",
    "shared purpose",
    "self-sufficient",
    "generations have",
    "ongoing rhythm",
    "farm implements",
    "day's tasks",
    "deep sense of",
    "making a living directly",
    "community here has",
)
PLACE_ANGLES = ("daily_life", "food", "one_landmark", "work_people")
ANGLES = ("daily_life", "food", "one_landmark", "work_people", "one_landscape")
ANGLE_FACT = {
    "daily_life": "culture",
    "food": "food",
    "one_landmark": "history",
    "road_view": "road",
    "work_people": "culture",
    "one_landscape": "landscape",
}


def used_hooks(texts: list[str]) -> list[str]:
    blob = " ".join(texts).lower()
    found: list[str] = []
    seen: set[str] = set()
    for key, label in HOOKS:
        if key in blob and label not in seen:
            seen.add(label)
            found.append(label)
    return found


def pick_angle(request: ScriptRequest) -> str:
    used = " ".join(used_hooks(request.already_said)).lower()
    wheel = PLACE_ANGLES if request.already_said else ANGLES
    topic_map = {
        "food": "food",
        "culture": "work_people",
        "road": "daily_life",
        "history": "one_landmark",
        "landscape": "daily_life" if request.already_said else "one_landscape",
        "geology": "daily_life",
        "surprise": wheel[len(request.already_said) % len(wheel)],
        "weather": "daily_life",
    }
    preferred = topic_map.get(request.topic.value, wheel[len(request.already_said) % len(wheel)])
    blocked = {
        "road_view": True,
        "one_landscape": bool(request.already_said) or any(token in used for token in ("accursed", "spring", "rugova", "dukagjini")),
        "food": "flija" in used and "beer" in used,
        "one_landmark": "ottoman" in used and "patriarch" in used,
    }
    if not blocked.get(preferred):
        return preferred
    for alt in ANGLES:
        if not blocked.get(alt):
            return alt
    return "daily_life"


def _too_similar(spoken: str, already: list[str]) -> bool:
    if not already:
        return False
    overlap = set(used_hooks([spoken])) & set(used_hooks(already))
    return len(overlap) >= 2


def _generic_filler(spoken: str) -> bool:
    blob = spoken.lower()
    return sum(1 for phrase in GENERIC_FILLER if phrase in blob) >= 2


def _missing_unique(spoken: str, request: ScriptRequest, local: dict | None) -> bool:
    blob = spoken.lower()
    street = (request.place.road_name or (local or {}).get("street") or "").strip()
    means = ((local or {}).get("name_means") or "").strip()
    if street and street.lower() not in blob:
        tokens = [part for part in street.lower().replace("ë", "e").split() if len(part) >= 4]
        if tokens and not any(part in blob.replace("ë", "e") for part in tokens):
            return True
    if means and not street:
        key = (local or {}).get("name") or request.place.name
        if key and key.lower() not in blob:
            return True
    return False


def _duration_for(text: str, expand: bool) -> int:
    words = max(1, len(text.split()))
    seconds = int(round(words / WORD_RATE))
    low, high = (30, 60) if expand else (20, 45)
    return min(high, max(low, seconds))


def _parse_json(text: str) -> dict:
    match = JSON_FENCE.search(text)
    raw = match.group(1) if match else text
    raw = raw.strip()
    return json.loads(raw)


def _lookup_local(place) -> dict | None:
    return knowledge.match_context(
        place.name,
        place.municipality or place.city,
        place.latitude,
        place.longitude,
    )


def _fallback(request: ScriptRequest) -> NarrationScript:
    local = _lookup_local(request.place)
    fact = ""
    used = "knowledge"
    if local:
        fact = knowledge.fact_for(local, request.topic.value)
    if not fact:
        fact = request.place.wikipedia_extract or request.place.summary or ""
        used = "wikipedia" if request.place.wikipedia_extract else "knowledge"
    if not fact:
        bits = [f"{request.place.name} is a {request.place.kind} you are driving through."]
        if request.place.neighbourhood and request.place.neighbourhood != request.place.name:
            bits.append(f"Neighbourhood: {request.place.neighbourhood}.")
        if request.place.city:
            bits.append(f"In {request.place.city}.")
        if request.place.region:
            bits.append(f"Region: {request.place.region}.")
        if request.place.country:
            bits.append(f"{request.place.country}.")
        fact = " ".join(bits)
        used = "knowledge"
    spoken = _scrub_spoken(fact)
    if request.weather:
        spoken = f"{spoken} Outside: {request.weather}."
    if request.pace == DrivePace.highway and request.place.region:
        spoken = f"Through {request.place.name} in {request.place.region}. {spoken}"
    return NarrationScript(
        id=f"local-{request.place.id}-{request.topic.value}",
        place_id=request.place.id,
        topic=request.topic,
        title=f"{request.place.name} · {request.topic.value}",
        spoken_text=spoken[:1200],
        duration_hint_s=_duration_for(spoken, request.expand),
        bridge_in=f"Coming up, {request.place.name}.",
        tags=[request.place.kind, request.topic.value],
        cached=True,
        source=used,  # type: ignore[arg-type]
    )


_POSTAL_DUMP = re.compile(
    r"(?i)(\b\d{1,4}\b.+){0,1}(municipality of|district of|\b\d{4,5}\b).+",
)


def _scrub_spoken(text: str) -> str:
    kept: list[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+", text.strip()):
        if _POSTAL_DUMP.search(sentence):
            continue
        if sentence.count(",") >= 3 and re.search(r"\d", sentence):
            continue
        if re.search(r"(?i)no break|still on the air|microphone open|specific, not generic", sentence):
            continue
        kept.append(sentence)
    return " ".join(kept).strip() or text.strip()


def _script_from_model(request: ScriptRequest, data: dict, source: str) -> NarrationScript:
    spoken = _scrub_spoken(str(data["spoken_text"]))
    return NarrationScript(
        id=str(uuid.uuid4()),
        place_id=request.place.id,
        topic=Topic(request.topic),
        title=str(data.get("title") or request.place.name),
        spoken_text=spoken,
        duration_hint_s=int(data.get("duration_hint_s") or _duration_for(spoken, request.expand)),
        bridge_in=str(data.get("bridge_in") or f"Next, {request.place.name}."),
        tags=list(data.get("tags") or [request.topic.value]),
        cached=False,
        source=source,  # type: ignore[arg-type]
    )


def _packet(request: ScriptRequest) -> dict:
    settings = get_settings()
    local = _lookup_local(request.place)
    place = request.place.model_dump()
    place.pop("address_line", None)
    banned = used_hooks(request.already_said)
    angle = pick_angle(request)
    fact_topic = ANGLE_FACT.get(angle, request.topic.value)
    locator = [
        item
        for item in (request.place.facts or [])
        if not item.lower().startswith(("history:", "landscape:", "geology:", "food:", "culture:", "road:", "city context:"))
    ]
    return {
        "language": "en",
        "place": place,
        "topic": request.topic.value,
        "angle": angle,
        "pace": request.pace.value,
        "weather": request.weather,
        "expand": request.expand,
        "tone": settings.host_voice_tone,
        "previous_place_ids": request.previous_place_ids,
        "this_place_owns": (local or {}).get("hook"),
        "unique_nouns": {
            "place_name_means": (local or {}).get("name_means"),
            "street_you_are_on": request.place.road_name or (local or {}).get("street"),
            "street_note": (local or {}).get("street_note"),
        },
        "seeded_local_fact": knowledge.fact_for(local, fact_topic) if local else None,
        "briefing": {
            "known_text": None if request.already_said else (request.place.wikipedia_extract or request.place.summary),
            "wikipedia_title": request.place.wikipedia_title,
            "on_the_ground": request.place.landmarks,
            "locator": locator,
        },
        "already_said": request.already_said[-8:],
        "do_not_repeat": banned,
        "continuation": request.continuation,
        "instruction": (
            f"Angle is {angle}. Use this_place_owns. "
            f"Never mention: {', '.join(banned) or 'nothing yet'}. "
            "Name the street and/or what the place-name means. "
            "The Peja–Istog pavement looks the same — do not narrate the road. "
            "Do not write a generic working-village paragraph. "
            "Do not recap Peja or Istog greatest hits unless this place is that town "
            "and the hook has not been used."
        ),
    }


async def _claude(request: ScriptRequest, user: str) -> dict:
    import anthropic

    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    message = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=500,
        temperature=0.4,
        system=SCRIPT_SYSTEM,
        messages=[{"role": "user", "content": user}],
    )
    text = message.content[0].text if message.content else "{}"
    return _parse_json(text)


async def _openai(request: ScriptRequest, user: str) -> dict:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=25.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json={
                "model": settings.openai_model,
                "temperature": 0.4,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": SCRIPT_SYSTEM},
                    {"role": "user", "content": user},
                ],
            },
        )
        response.raise_for_status()
        text = response.json()["choices"][0]["message"]["content"]
    return _parse_json(text)


async def _gemini(request: ScriptRequest, user: str) -> dict:
    settings = get_settings()
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent"
    )
    async with httpx.AsyncClient(timeout=25.0) as client:
        response = await client.post(
            url,
            headers={"x-goog-api-key": settings.gemini_api_key},
            json={
                "system_instruction": {"parts": [{"text": SCRIPT_SYSTEM}]},
                "generationConfig": {
                    "temperature": 0.75,
                    "responseMimeType": "application/json",
                },
                "contents": [{"role": "user", "parts": [{"text": user}]}],
            },
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Gemini HTTP {response.status_code}: {response.text[:240]}")
        text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
    return _parse_json(text)


async def generate_script(request: ScriptRequest) -> NarrationScript:
    request.locale = "en"
    cache_key = cache.make_key(
        "script",
        "var4",
        request.place.id,
        request.place.name,
        request.topic.value,
        request.expand,
        "en",
        request.pace.value,
        request.already_said[-1] if request.already_said else "",
    )
    cached = None if request.continuation else cache.get_json(cache_key)
    if cached:
        script = NarrationScript.model_validate(cached)
        script.cached = True
        script.source = "cache"
        return script

    provider = active_llm()
    if provider:
        user = build_user_prompt(_packet(request))
        try:
            if provider == "claude":
                data = await _claude(request, user)
            elif provider == "openai":
                data = await _openai(request, user)
            else:
                data = await _gemini(request, user)
            script = _script_from_model(request, data, provider)
            local = _lookup_local(request.place)
            needs_retry = (
                _too_similar(script.spoken_text, request.already_said)
                or _generic_filler(script.spoken_text)
                or _missing_unique(script.spoken_text, request, local)
            )
            if needs_retry:
                retry_user = build_user_prompt(
                    {
                        **_packet(request),
                        "instruction": (
                            "REWRITE. Say the street name and/or what the place-name means. "
                            "No generic working-village paragraph. "
                            f"Banned: {', '.join(used_hooks(request.already_said + [script.spoken_text]))}."
                        ),
                    }
                )
                if provider == "claude":
                    data = await _claude(request, retry_user)
                elif provider == "openai":
                    data = await _openai(request, retry_user)
                else:
                    data = await _gemini(request, retry_user)
                script = _script_from_model(request, data, provider)
            cache.set_json(cache_key, script.model_dump(), ttl_s=60 * 60 * 24)
            return script
        except Exception as exc:
            import logging

            logging.getLogger("routeradio").warning("LLM %s failed: %s", provider, exc)

    script = _fallback(request)
    cache.set_json(cache_key, script.model_dump(), ttl_s=60 * 60 * 6)
    return script
