import { destinationPoint, haversineM, paceFromSpeed } from "../../core/geo";
import type { GeoPoint, Place } from "../../core/types";

export function lookaheadPlaces(point: GeoPoint, nearby: Place[], seconds = 90): Place[] {
  if (point.heading == null) return nearby.slice(0, 3);
  const speed = point.speedMps && point.speedMps > 2 ? point.speedMps : 16;
  const ahead = destinationPoint(point.latitude, point.longitude, point.heading, speed * seconds);
  return [...nearby].sort((a, b) => haversineM({ ...ahead, timestamp: 0 }, a) - haversineM({ ...ahead, timestamp: 0 }, b));
}

export function shouldPrefetch(point: GeoPoint): boolean {
  const pace = paceFromSpeed(point.speedMps);
  return pace === "rural" || pace === "highway";
}
