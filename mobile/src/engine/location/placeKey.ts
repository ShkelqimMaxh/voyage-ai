import type { Place } from "../../core/types";

export function placeKey(place: Place): string {
  const raw = place.name.toLowerCase().split(/[–—/\-,]/)[0]?.trim() ?? place.id;
  return raw.normalize("NFKD").replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim() || place.id;
}
