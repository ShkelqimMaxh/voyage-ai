import { prefetchRoute } from "../../core/api";
import type { GeoPoint, NarrationScript, Place, Topic } from "../../core/types";

class RouteCache {
  private scripts = new Map<string, NarrationScript>();
  private audio = new Map<string, string>();
  private places = new Map<string, Place>();

  scriptFor(placeId: string, topic: Topic): NarrationScript | undefined {
    return [...this.scripts.values()].find((script) => script.placeId === placeId && script.topic === topic);
  }

  putScript(script: NarrationScript): void {
    this.scripts.set(script.id, script);
  }

  putAudio(scriptId: string, url: string): void {
    this.audio.set(scriptId, url);
  }

  audioUrl(scriptId: string): string | undefined {
    return this.audio.get(scriptId);
  }

  rememberPlaces(places: Place[]): void {
    places.forEach((place) => this.places.set(place.id, place));
  }

  clear(): void {
    this.scripts.clear();
    this.audio.clear();
    this.places.clear();
  }

  async prefetch(polyline: GeoPoint[], topics: Topic[] = ["history", "landscape"]): Promise<void> {
    try {
      const result = await prefetchRoute(polyline, topics);
      this.rememberPlaces(result.places);
    } catch {
      // offline: knowledge pack already covers the demo corridor
    }
  }
}

export const routeCache = new RouteCache();
