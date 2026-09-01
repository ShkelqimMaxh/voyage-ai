from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import get_settings
from app.models.schemas import TtsRequest, TtsResponse
from app.services.tts import render_tts

router = APIRouter(prefix="/v1/tts", tags=["tts"])


@router.post("/render", response_model=TtsResponse)
async def render(request: TtsRequest) -> TtsResponse:
    try:
        return await render_tts(request)
    except RuntimeError as exc:
        # 502, not 500: the voice provider failed, and the client deserves to know
        # which one and why so a quota wall is one curl away from being obvious.
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/files/{name}")
async def file(name: str) -> FileResponse:
    if "/" in name or ".." in name:
        raise HTTPException(status_code=400, detail="Invalid name")
    path = Path(get_settings().cache_dir) / "tts" / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Not found")
    media = "audio/wav" if path.suffix == ".wav" else "audio/mpeg"
    return FileResponse(path, media_type=media, headers={"Cache-Control": "public, max-age=86400"})
