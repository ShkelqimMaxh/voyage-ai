import { Platform } from "react-native";

import type { GeoPoint, PlaceContext } from "../../core/types";
import { pointAlongRoute } from "../../core/geo";
import { BACKGROUND_LOCATION_TASK } from "./backgroundLocationTask";
import { PEJA_ISTOG_DURATION_MS, PEJA_ISTOG_ROAD_WAYPOINTS, PEJA_ISTOG_SPEED_MPS } from "./pejaIstogDemo";
import { ReverseGeocoder } from "./ReverseGeocoder";

type PointListener = (point: GeoPoint) => void;

export class LocationEngine {
  private watch: { remove(): void } | null = null;
  private demoTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<PointListener>();
  readonly geocoder = new ReverseGeocoder();
  lastPoint: GeoPoint | null = null;

  onPoint(listener: PointListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async startLive(): Promise<void> {
    this.stop();
    if (Platform.OS === "web") {
      await this.startBrowserGeo();
      return;
    }
    const Location = await import("expo-location");
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      throw new Error("Location permission denied");
    }
    await Location.requestBackgroundPermissionsAsync().catch(() => undefined);

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 2000,
      distanceInterval: 15,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "RouteRadio is on air",
        notificationBody: "Listening to the road around you.",
      },
    });

    this.watch = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 1500,
        distanceInterval: 8,
      },
      (update) => {
        this.publish({
          latitude: update.coords.latitude,
          longitude: update.coords.longitude,
          heading: update.coords.heading != null && update.coords.heading >= 0 ? update.coords.heading : null,
          speedMps: update.coords.speed != null && update.coords.speed >= 0 ? update.coords.speed : null,
          altitudeM: update.coords.altitude,
          timestamp: update.timestamp,
        });
      },
    );
  }

  startDemo(
    // Typed explicitly: inferred from the default, `route` would narrow to the
    // Peja polyline's literal coordinates and reject every other demo route.
    route: Array<{ latitude: number; longitude: number }> = PEJA_ISTOG_ROAD_WAYPOINTS,
    durationMs: number = PEJA_ISTOG_DURATION_MS,
    speedMps: number = PEJA_ISTOG_SPEED_MPS,
  ): void {
    this.stop();
    const started = Date.now();
    const publishAt = (t: number) => {
      const position = pointAlongRoute(route, t);
      this.publish({
        latitude: position.latitude,
        longitude: position.longitude,
        heading: position.heading,
        speedMps,
        timestamp: Date.now(),
      });
    };
    publishAt(0);
    this.demoTimer = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / durationMs);
      publishAt(t);
      if (t >= 1 && this.demoTimer) {
        clearInterval(this.demoTimer);
        this.demoTimer = null;
      }
    }, 1500);
  }

  stop(): void {
    this.watch?.remove();
    this.watch = null;
    if (this.demoTimer) {
      clearInterval(this.demoTimer);
      this.demoTimer = null;
    }
    if (Platform.OS !== "web") {
      import("expo-location")
        .then((Location) => Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK))
        .then((started) => {
          if (started) {
            return import("expo-location").then((Location) =>
              Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK),
            );
          }
        })
        .catch(() => undefined);
    }
  }

  async context(point: GeoPoint, force = false): Promise<PlaceContext> {
    return this.geocoder.resolve(point, force);
  }

  private async startBrowserGeo(): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      throw new Error("Geolocation unavailable");
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        this.publish({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          heading: pos.coords.heading,
          speedMps: pos.coords.speed,
          altitudeM: pos.coords.altitude,
          timestamp: pos.timestamp,
        });
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 2000 },
    );
    this.watch = { remove: () => navigator.geolocation.clearWatch(id) };
  }

  private publish(point: GeoPoint): void {
    this.lastPoint = point;
    this.listeners.forEach((listener) => listener(point));
  }
}

export const locationEngine = new LocationEngine();
