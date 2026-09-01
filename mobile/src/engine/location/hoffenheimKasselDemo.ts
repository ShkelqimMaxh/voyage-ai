import { HOFFENHEIM_KASSEL_ROAD } from "./hoffenheimKasselRoad";

/**
 * Real road Hoffenheim → Kassel via A6/A5/A7 (OSRM `driving` profile),
 * about 287 km / 166 minutes at real driving speed. Demo runs it in 60
 * minutes ("1h road"), same compression idea as the Peja–Istog and
 * SF–Oakland demos: the geofence dwell timer, backend latency and TTS
 * playback all stay wall-clock real, only the point-to-point travel is
 * sped up.
 */
export const HOFFENHEIM_KASSEL_WAYPOINTS = HOFFENHEIM_KASSEL_ROAD.map((point) => ({
  latitude: point.latitude,
  longitude: point.longitude,
}));

export const HOFFENHEIM_KASSEL_DISTANCE_M = 287_416;
export const HOFFENHEIM_KASSEL_DURATION_MS = 60 * 60 * 1000;
export const HOFFENHEIM_KASSEL_SPEED_MPS = HOFFENHEIM_KASSEL_DISTANCE_M / (HOFFENHEIM_KASSEL_DURATION_MS / 1000);
