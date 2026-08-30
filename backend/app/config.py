from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        extra="ignore",
    )

    # One of these AI keys is enough. First match wins unless LLM_PROVIDER is set.
    llm_provider: str = "gemini"  # claude | openai | gemini
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-3-5-haiku-latest"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    gemini_tts_model: str = "gemini-2.5-pro-preview-tts"
    gemini_tts_voice: str = "Callirrhoe"

    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    mapbox_access_token: str = ""
    redis_url: str = ""
    cache_dir: str = "./storage"
    host_voice_tone: str = "soft storyteller, familiar, unhurried"
    default_locale: str = "en"
    cors_origins: str = "http://localhost:8081,http://localhost:19006"
    nominatim_user_agent: str = "RouteRadio/0.1 (voyagefm; research)"
    script_max_seconds: int = 45
    script_min_seconds: int = 20


@lru_cache
def get_settings() -> Settings:
    return Settings()


def active_llm() -> str | None:
    settings = get_settings()
    forced = settings.llm_provider.strip().lower()
    available = {
        "claude": bool(settings.anthropic_api_key),
        "openai": bool(settings.openai_api_key),
        "gemini": bool(settings.gemini_api_key),
    }
    if forced in available:
        return forced if available[forced] else None
    for name in ("gemini", "claude", "openai"):
        if available[name]:
            return name
    return None
