import { PEJA_ISTOG_ROAD } from "./pejaIstogRoad";

/** Real road Peja → Istog, about 25 km / 32 minutes. Demo runs it in 20 minutes. */
export const PEJA_ISTOG_ROAD_WAYPOINTS = PEJA_ISTOG_ROAD.map((point) => ({
  latitude: point.latitude,
  longitude: point.longitude,
}));

export const PEJA_ISTOG_DURATION_MS = 20 * 60 * 1000;
export const PEJA_ISTOG_SPEED_MPS = 20.5;
