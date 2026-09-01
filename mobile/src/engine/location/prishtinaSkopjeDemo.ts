import { PRISHTINA_SKOPJE_ROAD } from "./prishtinaSkopjeRoad";

/**
 * Real road Prishtina → Skopje (OSRM `driving` profile): 92.4 km, 81 minutes
 * at real driving speed. The demo compresses the travel into 20 minutes —
 * same idea as the Peja–Istog and SF–Oakland demos: geofence dwell, backend
 * latency and TTS playback all stay wall-clock real, only the point-to-point
 * travel is sped up.
 *
 * Unlike the Hoffenheim demo, the reported speed is the *real* drive average
 * (19.1 m/s ≈ 69 km/h), not distance/compressed-duration. The speed we publish
 * is what `paceFromSpeed` turns into the pace we send the host and the
 * geofence radius we use, so a compressed 277 km/h would make every script
 * read like a motorway blur. The corridor is a mix of R6 motorway and town
 * sections — "rural" is the honest pace.
 */
export const PRISHTINA_SKOPJE_WAYPOINTS = PRISHTINA_SKOPJE_ROAD.map((point) => ({
  latitude: point.latitude,
  longitude: point.longitude,
}));

export const PRISHTINA_SKOPJE_DISTANCE_M = 92_368;
export const PRISHTINA_SKOPJE_REAL_DURATION_MS = 4_837_000;
export const PRISHTINA_SKOPJE_DURATION_MS = 20 * 60 * 1000;
export const PRISHTINA_SKOPJE_SPEED_MPS = 19.1;
