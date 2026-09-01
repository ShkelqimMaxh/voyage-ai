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
    # What the host has already said about THIS place, oldest first. The running
    # thread it is meant to continue rather than restart.
    already_said_here: list[str] = []
    # The same thread compressed to one short line per clip ("Teuta's fleet beaten
    # by Rome, 229 BC"). Carrying points instead of whole scripts is what keeps the
    # request small however long the car sits in one village.
    already_covered_here: list[str] = []
    # Every point aired so far this drive, across all places, as short keys. The
    # per-place thread is dropped when the car leaves; this is what stops the
    # same monastery being introduced again two villages later.
    covered_keys: list[str] = []
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
    # One short line naming what this clip taught, for the next clip's memory.
    covered: str = ""
    # Set when even the rewrite taught something already aired. The client skips
    # these rather than repeat itself; there are more clips in the queue.
    duplicate: bool = False
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
