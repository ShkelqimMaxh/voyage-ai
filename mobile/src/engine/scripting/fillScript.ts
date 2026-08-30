import type { Place } from "../../core/types";

export function roadPlace(point: { latitude: number; longitude: number } | null, last: Place | null): Place {
  if (last) return last;
  const latitude = point?.latitude ?? 0;
  const longitude = point?.longitude ?? 0;
  return {
    id: `on-the-road-${latitude.toFixed(3)}-${longitude.toFixed(3)}`,
    name: "this road",
    kind: "road",
    latitude,
    longitude,
    summary: "You are moving. Talk about what is actually around these coordinates — not another country.",
  };
}
