import { VRELLE_CERRCE_ROAD } from "./vrelleCerrceRoad";

/**
 * Vrellë → Cërrcë, two villages in Istog municipality: 5.0 km of village road
 * that takes about 10 minutes to actually drive. Short enough that the demo
 * runs it in real time — no compression — at the ~30 km/h these back roads
 * really move at.
 */
export const VRELLE_CERRCE_WAYPOINTS = VRELLE_CERRCE_ROAD.map((point) => ({
  latitude: point.latitude,
  longitude: point.longitude,
}));

export const VRELLE_CERRCE_DISTANCE_M = 5_036;
export const VRELLE_CERRCE_DURATION_MS = 10 * 60 * 1000;
export const VRELLE_CERRCE_SPEED_MPS = 8.4;
