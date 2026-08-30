from __future__ import annotations

from app.knowledge import kosovo_dukagjini as knowledge
from app.models.schemas import (
    GeoPoint,
    NarrationScript,
    Place,
    RoutePrefetchRequest,
    RoutePrefetchResponse,
    ScriptRequest,
)
from app.services.claude_scripts import generate_script


def _sample(points: list[GeoPoint], meters: int) -> list[GeoPoint]:
    if not points:
        return []
    sampled = [points[0]]
    acc = 0.0
    prev = points[0]
    for point in points[1:]:
        acc += knowledge.haversine_m(prev.latitude, prev.longitude, point.latitude, point.longitude)
        if acc >= meters:
            sampled.append(point)
            acc = 0.0
        prev = point
    if sampled[-1] is not points[-1]:
        sampled.append(points[-1])
    return sampled


async def prefetch_route(request: RoutePrefetchRequest) -> RoutePrefetchResponse:
    unique: dict[str, Place] = {}
    for point in _sample(request.polyline, request.sample_meters):
        hits = knowledge.nearest(point.latitude, point.longitude, limit=2, max_m=8000)
        for raw in hits:
            if raw["kind"] in {"region", "range", "river"} and raw["id"] in unique:
                continue
            unique[raw["id"]] = Place(
                id=raw["id"],
                name=raw["name"],
                kind=raw["kind"],
                country=raw.get("country"),
                region=raw.get("region"),
                municipality=raw.get("municipality"),
                latitude=raw["latitude"],
                longitude=raw["longitude"],
                distance_m=raw.get("distance_m"),
                summary=raw.get("summary"),
            )

    scripts: list[NarrationScript] = []
    cached = 0
    for place in unique.values():
        for topic in request.topics:
            script = await generate_script(
                ScriptRequest(place=place, topic=topic, locale=request.locale)
            )
            scripts.append(script)
            if script.cached:
                cached += 1

    return RoutePrefetchResponse(
        places=list(unique.values()),
        scripts=scripts,
        cached_count=cached,
    )
