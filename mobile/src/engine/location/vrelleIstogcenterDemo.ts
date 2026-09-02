import { VRELLE_ISTOGCENTER_ROAD } from "./vrelleIstogcenterRoad";

/**
 * Vrellë → Istog town centre: 7.1 km of village road into the town, through
 * Lubozhdë and Cërrcë. OSRM calls it 7.5 minutes; on these roads, with the
 * junctions and the tractors, 17 is closer to the truth, so the demo runs it in
 * 17 at the ~25 km/h that implies. No compression — everything here is real time.
 */
export const VRELLE_ISTOGCENTER_WAYPOINTS = VRELLE_ISTOGCENTER_ROAD.map((point) => ({
  latitude: point.latitude,
  longitude: point.longitude,
}));

export const VRELLE_ISTOGCENTER_DISTANCE_M = 7_052;
export const VRELLE_ISTOGCENTER_DURATION_MS = 17 * 60 * 1000;
export const VRELLE_ISTOGCENTER_SPEED_MPS = 6.9;
