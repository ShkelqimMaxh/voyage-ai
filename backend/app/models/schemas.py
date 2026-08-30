from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class Topic(str, Enum):
    history = "history"
    landscape = "landscape"
    geology = "geology"
    food = "food"
    culture = "culture"
    road = "road"
    weather = "weather"
    surprise = "surprise"


class DrivePace(str, Enum):
    crawl = "crawl"
    urban = "urban"
    rural = "rural"
    highway = "highway"


class GeoPoint(BaseModel):
    latitude: float
    longitude: float
    heading: float | None = None
    speed_mps: float | None = None
    altitude_m: float | None = None


class Place(BaseModel):
    id: str
    name: str
    kind: str
    country: str | None = None
    region: str | None = None
    municipality: str | None = None
    city: str | None = None
    neighbourhood: str | None = None
    latitude: float
    longitude: float
    osm_id: str | None = None
    distance_m: float | None = None
    summary: str | None = None
    address_line: str | None = None
    wikipedia_title: str | None = None
    wikipedia_extract: str | None = None
    landmarks: list[str] = []
    facts: list[str] = []
    road_name: str | None = None


class PlaceResolveRequest(BaseModel):
    point: GeoPoint
    lookahead_seconds: int = Field(default=90, ge=15, le=600)
    locale: str = "en"


class PlaceResolveResponse(BaseModel):
    current: Place | None
    nearby: list[Place] = []
    region: Place | None = None
    source: Literal["osm", "mapbox", "knowledge", "mixed"] = "osm"


class ScriptRequest(BaseModel):
    place: Place
    topic: Topic = Topic.surprise
    pace: DrivePace = DrivePace.rural
    weather: str | None = None
    locale: str = "en"
    expand: bool = False
    previous_place_ids: list[str] = []
    already_said: list[str] = []
    continuation: bool = False


class NarrationScript(BaseModel):
    id: str
    place_id: str
    topic: Topic
    title: str
    spoken_text: str = Field(..., min_length=20)
    duration_hint_s: int = Field(..., ge=15, le=60)
    bridge_in: str
    tags: list[str] = []
    cached: bool = False
    source: Literal["claude", "openai", "gemini", "knowledge", "wikipedia", "cache"] = "claude"


class TtsRequest(BaseModel):
    script_id: str
    text: str
    voice_id: str | None = None
    provider: Literal["auto", "gemini", "elevenlabs", "openai", "device"] = "auto"


class TtsResponse(BaseModel):
    script_id: str
    provider: str
    audio_url: str | None = None
    cached: bool = False


class RoutePrefetchRequest(BaseModel):
    polyline: list[GeoPoint]
    topics: list[Topic] = [Topic.history, Topic.landscape]
    locale: str = "en"
    sample_meters: int = Field(default=1200, ge=200, le=8000)


class RoutePrefetchResponse(BaseModel):
    places: list[Place]
    scripts: list[NarrationScript]
    cached_count: int
