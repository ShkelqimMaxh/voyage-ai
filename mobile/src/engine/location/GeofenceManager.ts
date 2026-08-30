import { config } from "../../core/config";
import { geofenceRadiusM, haversineM, paceFromSpeed } from "../../core/geo";
import type { BoundaryEvent, GeoPoint, Place } from "../../core/types";
import { placeKey } from "./placeKey";

export class GeofenceManager {
  private current: Place | null = null;
  private enteredAt = 0;

  reset(): void {
    this.current = null;
    this.enteredAt = 0;
  }

  ingest(point: GeoPoint, candidate: Place | null): BoundaryEvent | null {
    if (!candidate) return null;
    const pace = paceFromSpeed(point.speedMps);
    const radius = geofenceRadiusM(pace);
    const distance = haversineM(point, candidate);
    if (distance > radius && candidate.kind !== "region" && candidate.kind !== "city") {
      return null;
    }

    if (this.current && placeKey(this.current) === placeKey(candidate)) {
      return null;
    }

    if (this.current && Date.now() - this.enteredAt < config.boundaryMinDwellMs) {
      return null;
    }

    const previous = this.current;
    this.current = candidate;
    this.enteredAt = Date.now();
    return {
      previous,
      current: candidate,
      point,
      pace,
    };
  }

  get currentPlace(): Place | null {
    return this.current;
  }
}
