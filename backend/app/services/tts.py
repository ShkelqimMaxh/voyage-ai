from __future__ import annotations

import base64
import hashlib
import io
import re
import wave
from pathlib import Path

import httpx

from app.config import get_settings
from app.models.schemas import TtsRequest, TtsResponse

ELEVEN_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
OPENAI_URL = "https://api.openai.com/v1/audio/speech"
GEMINI_TTS_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

STYLE_VERSION = "story-4"
HOST_STYLE = (
    "Read this out loud like a real person in a car, not an AI and not a narrator. "
    "Casual. Easy. A little fast. Natural ups and downs in your voice, "
    "like you just thought of it. Soft consonants. Not shiny, not perfect, not robotic. "
    "Do not add extra words.\n\n"
)


def _storage() -> Path:
    path = Path(get_settings().cache_dir) / "tts"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _file_for(request: TtsRequest, ext: str) -> Path:
    digest = hashlib.sha256(
        f"{STYLE_VERSION}:{request.provider}:{request.voice_id or get_settings().gemini_tts_voice}:{request.text}".encode()
    ).hexdigest()[:24]
    return _storage() / f"{request.script_id}-{digest}.{ext}"


def _resample_pcm16(pcm: bytes, src_rate: int, dest_rate: int = 44100) -> bytes:
    if src_rate == dest_rate or src_rate <= 0:
        return pcm
    import array

    samples = array.array("h")
    samples.frombytes(pcm)
    if not samples:
        return pcm
    ratio = dest_rate / src_rate
    out_len = max(1, int(len(samples) * ratio))
    out = array.array("h", [0] * out_len)
    last = len(samples) - 1
    for index in range(out_len):
        pos = index / ratio
        left = int(pos)
        right = min(left + 1, last)
        frac = pos - left
        out[index] = int(samples[left] * (1 - frac) + samples[right] * frac)
    return out.tobytes()


def _pcm_to_wav(pcm: bytes, rate: int = 24000) -> bytes:
    playable = _resample_pcm16(pcm, rate, 44100)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(44100)
        wav.writeframes(playable)
    return buffer.getvalue()


def _sample_rate(mime: str) -> int:
    match = re.search(r"rate=(\d+)", mime or "")
    return int(match.group(1)) if match else 24000


def _pick_provider(requested: str, settings) -> str:
    if requested == "elevenlabs" and settings.elevenlabs_api_key:
        return "elevenlabs"
    if requested == "gemini" and settings.gemini_api_key:
        return "gemini"
    if requested == "openai" and settings.openai_api_key:
        return "openai"
    if requested in {"device"}:
        return "device"
    if settings.elevenlabs_api_key:
        return "elevenlabs"
    if settings.gemini_api_key:
        return "gemini"
    if settings.openai_api_key:
        return "openai"
    return "device"


async def _gemini_tts(text: str, voice: str, model: str, api_key: str) -> bytes:
    models = [model, "gemini-2.5-pro-preview-tts", "gemini-2.5-flash-preview-tts"]
    voices = [voice, "Callirrhoe", "Achird", "Umbriel", "Aoede"]
    last_error = "Gemini TTS failed"
    async with httpx.AsyncClient(timeout=60.0) as client:
        for candidate in dict.fromkeys(models):
            response = await client.post(
                GEMINI_TTS_URL.format(model=candidate),
                headers={"x-goog-api-key": api_key},
                json={
                    "contents": [{"parts": [{"text": HOST_STYLE + text}]}],
                    "generationConfig": {
                        "responseModalities": ["AUDIO"],
                        "speechConfig": {
                            "voiceConfig": {
                                "prebuiltVoiceConfig": {"voiceName": voices[0]}
                            }
                        },
                    },
                },
            )
            if response.status_code >= 400:
                last_error = f"Gemini TTS HTTP {response.status_code}"
                continue
            part = response.json()["candidates"][0]["content"]["parts"][0]
            inline = part.get("inlineData") or part.get("inline_data") or {}
            data = inline.get("data")
            if not data:
                last_error = "Gemini TTS returned no audio"
                continue
            pcm = base64.b64decode(data)
            rate = _sample_rate(inline.get("mimeType") or inline.get("mime_type") or "")
            return _pcm_to_wav(pcm, rate)
    raise RuntimeError(last_error)


async def render_tts(request: TtsRequest) -> TtsResponse:
    settings = get_settings()
    provider = _pick_provider(request.provider, settings)

    if provider == "gemini":
        dest = _file_for(request, "wav")
        if dest.exists():
            return TtsResponse(
                script_id=request.script_id,
                provider="gemini",
                audio_url=f"/v1/tts/files/{dest.name}",
                cached=True,
            )
        audio = await _gemini_tts(
            request.text,
            request.voice_id or settings.gemini_tts_voice,
            settings.gemini_tts_model,
            settings.gemini_api_key,
        )
        dest.write_bytes(audio)
        return TtsResponse(
            script_id=request.script_id,
            provider="gemini",
            audio_url=f"/v1/tts/files/{dest.name}",
            cached=False,
        )

    dest = _file_for(request, "mp3")
    if dest.exists():
        return TtsResponse(
            script_id=request.script_id,
            provider=provider,
            audio_url=f"/v1/tts/files/{dest.name}",
            cached=True,
        )

    if provider == "elevenlabs":
        voice = request.voice_id or settings.elevenlabs_voice_id
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                ELEVEN_URL.format(voice_id=voice),
                headers={
                    "xi-api-key": settings.elevenlabs_api_key,
                    "Accept": "audio/mpeg",
                    "Content-Type": "application/json",
                },
                json={
                    "text": request.text,
                    "model_id": "eleven_turbo_v2_5",
                    "voice_settings": {"stability": 0.35, "similarity_boost": 0.8, "style": 0.45},
                },
            )
            response.raise_for_status()
            dest.write_bytes(response.content)
        return TtsResponse(
            script_id=request.script_id,
            provider="elevenlabs",
            audio_url=f"/v1/tts/files/{dest.name}",
            cached=False,
        )

    if provider == "openai":
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                OPENAI_URL,
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json={
                    "model": "gpt-4o-mini-tts",
                    "voice": request.voice_id or "coral",
                    "input": request.text,
                    "format": "mp3",
                },
            )
            response.raise_for_status()
            dest.write_bytes(response.content)
        return TtsResponse(
            script_id=request.script_id,
            provider="openai",
            audio_url=f"/v1/tts/files/{dest.name}",
            cached=False,
        )

    return TtsResponse(
        script_id=request.script_id,
        provider="device",
        audio_url=None,
        cached=False,
    )
