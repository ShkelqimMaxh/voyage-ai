import { resolvePlaces } from "../../core/api";
import { config } from "../../core/config";
import type { GeoPoint, PlaceContext } from "../../core/types";
import { nearestKnowledge } from "./localKnowledge";

export class ReverseGeocoder {
  private lastAt = 0;
  private lastPoint: GeoPoint | null = null;
  private lastResult: PlaceContext | null = null;

  async resolve(point: GeoPoint, force = false): Promise<PlaceContext> {
    const now = Date.now();
    if (
      !force &&
      this.lastResult &&
      now - this.lastAt < config.geocodeMinIntervalMs &&
      this.lastPoint &&
      Math.abs(this.lastPoint.latitude - point.latitude) < 0.002 &&
      Math.abs(this.lastPoint.longitude - point.longitude) < 0.002
    ) {
      return this.lastResult;
    }

    try {
      const remote = await resolvePlaces(point);
      this.lastAt = now;
      this.lastPoint = point;
      this.lastResult = remote;
      return remote;
    } catch {
      const hits = nearestKnowledge(point.latitude, point.longitude);
      const result: PlaceContext = {
        current: hits[0] ?? null,
        nearby: hits.slice(1, 6),
        region: hits.find((item) => item.kind === "region") ?? null,
        source: "knowledge",
      };
      this.lastAt = now;
      this.lastPoint = point;
      this.lastResult = result;
      return result;
    }
  }
}
