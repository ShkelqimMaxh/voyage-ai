from __future__ import annotations

import math
import re
from typing import Any
from urllib.parse import quote

import httpx

from app.config import get_settings
from app.knowledge import kosovo_dukagjini as knowledge
from app.models.schemas import GeoPoint, Place, PlaceResolveResponse

OVERPASS = "https://overpass-api.de/api/interpreter"
NOMINATIM = "https://nominatim.openstreetmap.org/reverse"
WIKI_GEO = "https://en.wikipedia.org/w/api.php"
WIKI_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/"
MAPBOX = "https://api.mapbox.com/geocoding/v5/mapbox.places/{lon},{lat}.json"

# Most specific first — Japan uses neighbourhood / quarter / suburb more than village.
GRANULAR_KEYS = (
    ("neighbourhood", "neighbourhood"),
    ("neighborhood", "neighbourhood"),
    ("quarter", "neighbourhood"),
    ("suburb", "suburb"),
    ("hamlet", "hamlet"),
    ("village", "village"),
    ("city_district", "district"),
    ("town", "town"),
    ("city", "city"),
    ("municipality", "municipality"),
)
BLOCK_RE = re.compile(r"(\d|丁目|番地|chōme|chome)", re.I)
POI_RE = re.compile(
    r"\b(hall|station|temple|shrine|school|hospital|park|cemetery|museum|office|hotel|shop|store|clinic)\b",
    re.I,
)


def _latin(name: str) -> bool:
    letters = [char for char in name if char.isalpha()]
    if not letters:
        return False
    return sum(1 for char in letters if char.isascii()) / len(letters) >= 0.55


def _is_block(name: str) -> bool:
    return bool(BLOCK_RE.search(name)) or bool(POI_RE.search(name))


def destination_point(lat: float, lon: float, heading_deg: float, meters: float) -> tuple[float, float]:
    r = 6371000.0
    bearing = math.radians(heading_deg)
    lat1, lon1 = math.radians(lat), math.radians(lon)
    ang = meters / r
    lat2 = math.asin(
        math.sin(lat1) * math.cos(ang) + math.cos(lat1) * math.sin(ang) * math.cos(bearing)
    )
    lon2 = lon1 + math.atan2(
        math.sin(bearing) * math.sin(ang) * math.cos(lat1),
        math.cos(ang) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), math.degrees(lon2)


def _to_place(raw: dict) -> Place:
    return Place(
        id=raw["id"],
        name=raw["name"],
        kind=raw.get("kind") or "village",
        country=raw.get("country"),
        region=raw.get("region"),
        municipality=raw.get("municipality"),
        city=raw.get("city"),
        neighbourhood=raw.get("neighbourhood"),
        latitude=raw["latitude"],
        longitude=raw["longitude"],
        osm_id=raw.get("osm_id"),
        distance_m=raw.get("distance_m"),
        summary=raw.get("summary"),
        address_line=raw.get("address_line") or raw.get("summary"),
        wikipedia_title=raw.get("wikipedia_title"),
        wikipedia_extract=raw.get("wikipedia_extract"),
        landmarks=raw.get("landmarks") if isinstance(raw.get("landmarks"), list) else [],
        facts=raw.get("facts") if isinstance(raw.get("facts"), list) else [],
        road_name=raw.get("street") or raw.get("road_name"),
    )


def _headers() -> dict[str, str]:
    return {
        "User-Agent": get_settings().nominatim_user_agent,
        "Accept-Language": "en",
    }


def _pick_name(address: dict[str, Any], fallback: str | None) -> tuple[str | None, str]:
    candidates: list[tuple[str, str]] = []
    for key, kind in GRANULAR_KEYS:
        value = address.get(key)
        if value:
            candidates.append((str(value), kind))
    if fallback:
        candidates.append((str(fallback), "place"))
    for name, kind in candidates:
        if not _is_block(name):
            return name, kind
    return (candidates[0] if candidates else (None, "place"))


async def _wiki_extract(title: str) -> tuple[str, str | None]:
    try:
        async with httpx.AsyncClient(timeout=6.0, headers=_headers()) as client:
            response = await client.get(
                WIKI_GEO,
                params={
                    "action": "query",
                    "prop": "extracts",
                    "exintro": 1,
                    "explaintext": 1,
                    "titles": title,
                    "format": "json",
                    "redirects": 1,
                },
            )
            response.raise_for_status()
            pages = (response.json().get("query") or {}).get("pages") or {}
    except Exception:
        return title, None
    for page in pages.values():
        extract = page.get("extract")
        if extract:
            return str(page.get("title") or title), str(extract)[:1200]
    return title, None


async def _wikipedia_search(name: str, country: str | None) -> tuple[str | None, str | None]:
    query = " ".join(part for part in (name, country) if part)
    try:
        async with httpx.AsyncClient(timeout=6.0, headers=_headers()) as client:
            response = await client.get(
                WIKI_GEO,
                params={
                    "action": "query",
                    "list": "search",
                    "srsearch": query,
                    "srlimit": 5,
                    "format": "json",
                },
            )
            response.raise_for_status()
            hits = (response.json().get("query") or {}).get("search") or []
    except Exception:
        return None, None
    hint = name.lower()
    title = None
    for hit in hits:
        candidate = str(hit.get("title") or "")
        if hint in candidate.lower():
            title = candidate
            break
    if not title and hits:
        title = str(hits[0].get("title") or "") or None
    if not title:
        return None, None
    return await _wiki_extract(title)


async def _ground_pois(lat: float, lon: float) -> list[str]:
    query = f"""
    [out:json][timeout:10];
    (
      node["historic"](around:1800,{lat},{lon});
      node["tourism"](around:1800,{lat},{lon});
      node["amenity"~"place_of_worship|memorial|grave_yard"](around:1800,{lat},{lon});
      node["natural"~"spring|peak|ridge"](around:2500,{lat},{lon});
      way["waterway"~"river|stream"](around:2000,{lat},{lon});
    );
    out center 16;
    """
    try:
        async with httpx.AsyncClient(timeout=12.0, headers=_headers()) as client:
            response = await client.post(OVERPASS, data={"data": query})
            response.raise_for_status()
            data = response.json()
    except Exception:
        return []
    labels: list[str] = []
    seen: set[str] = set()
    for element in data.get("elements", []):
        tags = element.get("tags") or {}
        name = tags.get("name:en") or tags.get("name")
        kind = tags.get("historic") or tags.get("tourism") or tags.get("amenity") or tags.get("natural") or tags.get("waterway")
        if not name and not kind:
            continue
        label = f"{name} ({kind})" if name and kind else (name or str(kind))
        if label in seen:
            continue
        seen.add(label)
        labels.append(label)
        if len(labels) >= 8:
            break
    return labels


async def _wikipedia_near(lat: float, lon: float, name_hint: str | None) -> tuple[str | None, str | None]:
    params = {
        "action": "query",
        "list": "geosearch",
        "gscoord": f"{lat}|{lon}",
        "gsradius": 2500,
        "gslimit": 8,
        "format": "json",
    }
    try:
        async with httpx.AsyncClient(timeout=6.0, headers=_headers()) as client:
            response = await client.get(WIKI_GEO, params=params)
            response.raise_for_status()
            hits = (response.json().get("query") or {}).get("geosearch") or []
    except Exception:
        return None, None
    title = None
    if name_hint:
        hint = name_hint.lower()
        for hit in hits:
            if hint in str(hit.get("title", "")).lower():
                title = hit.get("title")
                break
    if not title and hits:
        title = hits[0].get("title")
    if not title:
        return None, None
    try:
        async with httpx.AsyncClient(timeout=6.0, headers=_headers()) as client:
            response = await client.get(WIKI_SUMMARY + quote(str(title)))
            response.raise_for_status()
            data = response.json()
    except Exception:
        return str(title), None
    extract = data.get("extract") or data.get("description")
    return str(title), str(extract) if extract else None


async def _nominatim(point: GeoPoint) -> Place | None:
    params = {
        "lat": point.latitude,
        "lon": point.longitude,
        "format": "jsonv2",
        "zoom": 18,
        "addressdetails": 1,
        "extratags": 1,
        "namedetails": 1,
        "accept-language": "en",
    }
    try:
        async with httpx.AsyncClient(timeout=7.0, headers=_headers()) as client:
            response = await client.get(NOMINATIM, params=params)
            response.raise_for_status()
            data = response.json()
    except Exception:
        return None
    address = data.get("address") or {}
    named = data.get("namedetails") or {}
    fallback = named.get("name:en") or named.get("name") or data.get("name")
    name, kind = _pick_name(address, fallback)
    if not name:
        return None
    extras = data.get("extratags") or {}
    wiki_tag = extras.get("wikipedia") or extras.get("wikidata")
    wiki_title = None
    if isinstance(wiki_tag, str) and wiki_tag.startswith("en:"):
        wiki_title = wiki_tag.split(":", 1)[1]
    title, extract = await _wikipedia_near(point.latitude, point.longitude, name)
    english = named.get("name:en") or named.get("int_name")
    if english and (not _latin(name) or _is_block(name)):
        name = str(english)
    if title and (not _latin(name) or _is_block(name)):
        name = str(title).split(",")[0].strip()
    osm_id = f"{data.get('osm_type')}:{data.get('osm_id')}"
    city = address.get("city") or address.get("town")
    return Place(
        id=osm_id,
        name=name,
        kind=kind,
        country=address.get("country"),
        region=address.get("state") or address.get("province") or address.get("region"),
        municipality=address.get("municipality") or address.get("county") or address.get("city_district"),
        city=city,
        neighbourhood=address.get("neighbourhood") or address.get("quarter") or address.get("suburb"),
        latitude=float(data.get("lat") or point.latitude),
        longitude=float(data.get("lon") or point.longitude),
        osm_id=osm_id,
        distance_m=0,
        summary=extract or data.get("display_name"),
        address_line=data.get("display_name"),
        wikipedia_title=title or wiki_title,
        wikipedia_extract=extract,
        road_name=address.get("road") or address.get("pedestrian") or address.get("street"),
    )


async def _mapbox(point: GeoPoint) -> Place | None:
    token = get_settings().mapbox_access_token
    if not token:
        return None
    url = MAPBOX.format(lon=point.longitude, lat=point.latitude)
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            response = await client.get(
                url,
                params={
                    "access_token": token,
                    "types": "neighborhood,locality,place,district",
                    "language": "en",
                    "limit": 1,
                },
            )
            response.raise_for_status()
            features = response.json().get("features") or []
    except Exception:
        return None
    if not features:
        return None
    feature = features[0]
    context = {item.get("id", "").split(".")[0]: item.get("text") for item in feature.get("context") or []}
    name = feature.get("text")
    if not name:
        return None
    kind = (feature.get("place_type") or ["place"])[0]
    coords = feature.get("center") or [point.longitude, point.latitude]
    return Place(
        id=f"mapbox:{feature.get('id')}",
        name=name,
        kind=kind,
        country=context.get("country"),
        region=context.get("region"),
        municipality=context.get("district"),
        city=context.get("place"),
        neighbourhood=name if kind in {"neighborhood", "locality"} else context.get("neighborhood"),
        latitude=float(coords[1]),
        longitude=float(coords[0]),
        distance_m=0,
        summary=feature.get("place_name"),
        address_line=feature.get("place_name"),
    )


async def _overpass_nearby(point: GeoPoint) -> list[Place]:
    query = f"""
    [out:json][timeout:12];
    (
      node["place"~"city|town|village|hamlet|suburb|neighbourhood|quarter|isolated_dwelling"](around:4000,{point.latitude},{point.longitude});
      way["place"~"city|town|village|hamlet|suburb|neighbourhood|quarter"](around:4000,{point.latitude},{point.longitude});
    );
    out center 24;
    """
    try:
        async with httpx.AsyncClient(timeout=14.0, headers=_headers()) as client:
            response = await client.post(OVERPASS, data={"data": query})
            response.raise_for_status()
            data = response.json()
    except Exception:
        return []
    places: list[Place] = []
    for element in data.get("elements", []):
        tags: dict[str, Any] = element.get("tags") or {}
        name = tags.get("name:en") or tags.get("name")
        if not name:
            continue
        lat = element.get("lat") or (element.get("center") or {}).get("lat")
        lon = element.get("lon") or (element.get("center") or {}).get("lon")
        if lat is None or lon is None:
            continue
        osm_id = f"{element.get('type')}:{element.get('id')}"
        places.append(
            Place(
                id=osm_id,
                name=name,
                kind=tags.get("place", "village"),
                country=None,
                region=None,
                municipality=None,
                latitude=float(lat),
                longitude=float(lon),
                osm_id=osm_id,
                distance_m=knowledge.haversine_m(point.latitude, point.longitude, float(lat), float(lon)),
            )
        )
    places.sort(key=lambda item: item.distance_m or 0)
    return places[:8]


def _wiki_about(name: str, title: str | None, extract: str | None) -> bool:
    if not extract:
        return False
    needle = knowledge._fold(name)
    blob = knowledge._fold(f"{title or ''} {extract[:160]}")
    if needle and needle in blob:
        return True
    tokens = [part for part in needle.split() if len(part) >= 4]
    return bool(tokens) and all(part in blob for part in tokens)


def _local_override(point: GeoPoint) -> Place | None:
    hits = knowledge.nearest(
        point.latitude,
        point.longitude,
        limit=1,
        max_m=1500,
        kinds=knowledge.SETTLEMENT_KINDS,
    )
    if not hits:
        return None
    return _to_place(hits[0])


async def resolve_place(point: GeoPoint, lookahead_seconds: int = 90) -> PlaceResolveResponse:
    current = await _nominatim(point)
    source: str = "osm" if current else "osm"
    nearby: list[Place] = []

    mapbox = await _mapbox(point)
    if mapbox and current:
        if not current.neighbourhood and mapbox.neighbourhood:
            current.neighbourhood = mapbox.neighbourhood
        if mapbox.kind in {"neighborhood", "locality"} and current.kind in {"city", "town", "municipality", "district"}:
            current.name = mapbox.name
            current.kind = "neighbourhood"
            current.neighbourhood = mapbox.name
        source = "mixed"
    elif mapbox and not current:
        current = mapbox
        source = "mapbox"

    local = _local_override(point)
    if local and current is None:
        current = local
        source = "knowledge"
    elif local and current:
        nearby.append(local)

    nearby.extend(await _overpass_nearby(point))

    region = None
    if current and current.region:
        region = Place(
            id=f"region:{current.region}",
            name=current.region,
            kind="region",
            country=current.country,
            region=current.region,
            latitude=current.latitude,
            longitude=current.longitude,
            summary=current.region,
        )

    if current:
        local = knowledge.match_context(
            current.name, current.municipality or current.city, point.latitude, point.longitude
        )
        title, extract = await _wikipedia_search(current.name, current.country)
        if extract and not _wiki_about(current.name, title, extract):
            title, extract = None, None
        if not extract:
            title, extract = await _wikipedia_near(point.latitude, point.longitude, current.name)
            if extract and not _wiki_about(current.name, title, extract):
                title, extract = None, None
        current.wikipedia_title = current.wikipedia_title or title
        current.wikipedia_extract = extract or current.wikipedia_extract
        if extract and (not current.summary or current.summary == current.address_line):
            current.summary = extract
        current.landmarks = await _ground_pois(point.latitude, point.longitude)
        facts = []
        if current.municipality:
            facts.append(f"Municipality: {current.municipality}")
        if current.region:
            facts.append(f"Region: {current.region}")
        if current.city and current.city != current.name:
            facts.append(f"Near / in: {current.city}")
        if current.kind:
            facts.append(f"Type: {current.kind}")
        if local:
            same = knowledge._fold(local["name"]) == knowledge._fold(current.name) or any(
                knowledge._fold(alias) == knowledge._fold(current.name) for alias in local.get("aliases") or ()
            )
            if not current.road_name and local.get("street"):
                current.road_name = local["street"]
            if local.get("name_means"):
                facts.append(f"Name means: {local['name_means']}")
            if local.get("street_note") and current.road_name:
                facts.append(f"Street note: {local['street_note']}")
            if local.get("hook"):
                facts.append(f"This place owns: {local['hook']}")
            if same:
                facts.append(local.get("summary") or "")
            else:
                facts.append(
                    f"Locator only: you are in {current.name}, not a recap of {local['name']}. "
                    f"Talk about {current.name}."
                )
        if current.road_name:
            facts.insert(0, f"You are on the street named {current.road_name}. Say that name.")
        current.facts = [item for item in facts if item]

    if point.heading is not None:
        speed = point.speed_mps or 16.0
        ahead_m = max(400.0, speed * lookahead_seconds)
        alat, alon = destination_point(point.latitude, point.longitude, point.heading, ahead_m)
        ahead = await _overpass_nearby(GeoPoint(latitude=alat, longitude=alon))
        nearby.extend(ahead)

    seen: set[str] = set()
    unique: list[Place] = []
    current_id = current.id if current else None
    for place in nearby:
        if place.id == current_id or place.id in seen:
            continue
        seen.add(place.id)
        unique.append(place)

    return PlaceResolveResponse(
        current=current,
        nearby=unique[:8],
        region=region,
        source=source if current else "osm",
    )
