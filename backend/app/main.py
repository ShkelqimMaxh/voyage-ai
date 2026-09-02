import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import active_llm, get_settings
from app.routers import ask, places, prefetch, scripts, tts

settings = get_settings()

app = FastAPI(
    title="RouteRadio API",
    version="0.1.0",
    description="Location scripts, TTS, and route-vector cache for VoyageFM.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ask.router)
app.include_router(places.router)
app.include_router(scripts.router)
app.include_router(tts.router)
app.include_router(prefetch.router)


@app.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "locale": "en",
        "llm": active_llm(),
        "claude": bool(settings.anthropic_api_key),
        "openai": bool(settings.openai_api_key),
        "gemini": bool(settings.gemini_api_key),
        "elevenlabs": bool(settings.elevenlabs_api_key),
        "mapbox": bool(settings.mapbox_access_token),
        "redis": bool(settings.redis_url),
    }


def _resolve_web_dir() -> Path:
    """Locate the built Expo web bundle.

    Local dev layout:  backend/app/main.py -> repo_root/mobile/dist
    Docker image layout: /app/app/main.py  -> /app/mobile/dist
    Try both (plus an explicit override) instead of assuming one fixed depth.
    """
    if override := os.environ.get("WEB_DIST_DIR"):
        return Path(override)
    here = Path(__file__).resolve().parent  # .../app
    for candidate in (here.parent / "mobile" / "dist", here.parent.parent / "mobile" / "dist"):
        if (candidate / "index.html").is_file():
            return candidate
    return here.parent / "mobile" / "dist"


WEB_DIR = _resolve_web_dir()


@app.get("/")
async def web_index():
    index = WEB_DIR / "index.html"
    if not index.is_file():
        return {"ok": True, "web": False}
    return FileResponse(index)


if (WEB_DIR / "_expo").is_dir():
    app.mount("/_expo", StaticFiles(directory=str(WEB_DIR / "_expo")), name="expo_assets")
