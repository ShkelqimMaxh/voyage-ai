from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import active_llm, get_settings
from app.routers import places, prefetch, scripts, tts

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


WEB_DIR = Path(__file__).resolve().parent.parent.parent / "mobile" / "dist"


@app.get("/")
async def web_index():
    index = WEB_DIR / "index.html"
    if not index.is_file():
        return {"ok": True, "web": False}
    return FileResponse(index)


if (WEB_DIR / "_expo").is_dir():
    app.mount("/_expo", StaticFiles(directory=str(WEB_DIR / "_expo")), name="expo_assets")
