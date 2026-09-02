"""Answering a driver who interrupts the host with a question."""
from __future__ import annotations

import re
import uuid

from app.config import active_llm, get_settings
from app.knowledge import kosovo_dukagjini as knowledge
from app.models.schemas import AskRequest, AskResponse
from app.prompts.narration import ASK_SYSTEM, build_ask_prompt
from app.services.claude_scripts import (
    _claude,
    _gemini,
    _lookup_local,
    _openai,
    _parse_json,
    _scrub_spoken,
)

# "tell me more", "again", "what was that" — the one case where going back over
# something already said is exactly what was asked for.
MORE = re.compile(
    r"(?i)\b(more|again|repeat|repeated|what did you (just )?say|say that again|"
    r"expand|go on|continue|elaborate|didn'?t catch|missed that|louder)\b"
)


def wants_more(question: str) -> bool:
    return bool(MORE.search(question or ""))


def _duration_for(text: str) -> int:
    words = max(1, len(text.split()))
    return min(90, max(3, int(round(words / 2.5))))


def _fallback(request: AskRequest) -> AskResponse:
    local = _lookup_local(request.place)
    fact = ""
    if local:
        fact = knowledge.fact_for(local, "culture")
    fact = fact or request.place.wikipedia_extract or request.place.summary or ""
    spoken = _scrub_spoken(fact) if fact else (
        f"I don't have that one for {request.place.name}. Ask me again in a minute."
    )
    return AskResponse(
        id=f"ask-{uuid.uuid4()}",
        place_id=request.place.id,
        question=request.question,
        spoken_text=spoken[:900],
        duration_hint_s=_duration_for(spoken),
        on_topic=True,
        expanded=wants_more(request.question),
        covered="",
        source="knowledge",
    )


async def answer_question(request: AskRequest) -> AskResponse:
    provider = active_llm()
    if not provider:
        return _fallback(request)

    expanded = wants_more(request.question)
    local = _lookup_local(request.place)
    settings = get_settings()
    packet = {
        "language": "en",
        "question": request.question,
        "driver_wants_more": expanded,
        "place": {
            "name": request.place.name,
            "kind": request.place.kind,
            "municipality": request.place.municipality,
            "region": request.place.region,
            "country": request.place.country,
            "street_you_are_on": request.place.road_name,
        },
        "pace": request.pace.value,
        "weather": request.weather,
        "tone": settings.host_voice_tone,
        "you_were_mid_sentence_about": request.now_saying,
        "you_already_told_them_here": (request.already_covered_here or [])[-8:],
        "aired_this_drive": (request.covered_keys or [])[-30:],
        "this_place_owns": (local or {}).get("hook"),
        "known_text": request.place.wikipedia_extract or request.place.summary,
    }
    user = build_ask_prompt(packet)
    try:
        if provider == "claude":
            data = await _claude(request, user)  # type: ignore[arg-type]
        elif provider == "openai":
            data = await _openai(request, user)  # type: ignore[arg-type]
        else:
            data = await _gemini(request, user)  # type: ignore[arg-type]
    except Exception:
        return _fallback(request)

    spoken = _scrub_spoken(str(data.get("spoken_text") or "")).strip()
    if not spoken:
        return _fallback(request)
    return AskResponse(
        id=f"ask-{uuid.uuid4()}",
        place_id=request.place.id,
        question=request.question,
        spoken_text=spoken[:1200],
        duration_hint_s=int(data.get("duration_hint_s") or _duration_for(spoken)),
        on_topic=bool(data.get("on_topic", True)),
        expanded=expanded,
        covered=str(data.get("covered") or "")[:120],
        source=provider,  # type: ignore[arg-type]
    )
