import { SF_OAKLAND_ROAD } from "./sfOaklandRoad";

/** Real street path: Ferry Building → I-80 / Bay Bridge → downtown Oakland. */
export const SF_OAKLAND_WAYPOINTS = SF_OAKLAND_ROAD.map((point) => ({
  latitude: point.latitude,
  longitude: point.longitude,
}));

export const US_DEMO_DURATION_MS = 15 * 60 * 1000;
export const US_DEMO_SPEED_MPS = 18.3;
