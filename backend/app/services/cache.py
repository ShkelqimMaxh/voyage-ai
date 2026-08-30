from __future__ import annotations

import hashlib
import json
from typing import Any

from app.config import get_settings

_memory: dict[str, str] = {}
_redis = None


def _client():
    global _redis
    settings = get_settings()
    if _redis is not None:
        return _redis
    if not settings.redis_url:
        return None
    try:
        import redis

        _redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)
        _redis.ping()
        return _redis
    except Exception:
        _redis = None
        return None


def make_key(*parts: Any) -> str:
    raw = json.dumps(parts, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def get_json(key: str) -> Any | None:
    client = _client()
    raw = client.get(key) if client is not None else _memory.get(key)
    if not raw:
        return None
    return json.loads(raw)


def set_json(key: str, value: Any, ttl_s: int = 86400) -> None:
    raw = json.dumps(value, default=str)
    client = _client()
    if client is not None:
        client.setex(key, ttl_s, raw)
        return
    _memory[key] = raw
