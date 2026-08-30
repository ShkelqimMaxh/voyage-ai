import type { DrivePace, GeoPoint } from "./types";

const EARTH_M = 6_371_000;

export function haversineM(a: GeoPoint | { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const p1 = (a.latitude * Math.PI) / 180;
  const p2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function destinationPoint(
  lat: number,
  lon: number,
  headingDeg: number,
  meters: number,
): { latitude: number; longitude: number } {
  const brng = (headingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const ang = meters / EARTH_M;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(brng),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(ang) * Math.cos(lat1),
      Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { latitude: (lat2 * 180) / Math.PI, longitude: (lon2 * 180) / Math.PI };
}

export function paceFromSpeed(speedMps: number | null | undefined): DrivePace {
  const kmh = (speedMps ?? 0) * 3.6;
  if (kmh < 8) return "crawl";
  if (kmh < 55) return "urban";
  if (kmh < 80) return "rural";
  return "highway";
}

export function geofenceRadiusM(pace: DrivePace): number {
  switch (pace) {
    case "crawl":
      return 180;
    case "urban":
      return 350;
    case "rural":
      return 900;
    case "highway":
      return 1600;
  }
}

export function interpolate(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
  t: number,
): { latitude: number; longitude: number } {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

export function pointAlongRoute(
  route: Array<{ latitude: number; longitude: number }>,
  t: number,
): { latitude: number; longitude: number; heading: number } {
  const clamped = Math.min(1, Math.max(0, t));
  if (route.length === 0) return { latitude: 0, longitude: 0, heading: 0 };
  if (route.length === 1) return { ...route[0], heading: 0 };
  const distances = route.slice(0, -1).map((point, index) => haversineM(point, route[index + 1]));
  const total = distances.reduce((sum, item) => sum + item, 0) || 1;
  let remain = clamped * total;
  for (let i = 0; i < distances.length; i += 1) {
    const span = distances[i] || 1;
    if (remain <= span) {
      const here = interpolate(route[i], route[i + 1], remain / span);
      return { ...here, heading: bearingDeg(route[i], route[i + 1]) };
    }
    remain -= span;
  }
  const last = route[route.length - 1];
  const prev = route[route.length - 2];
  return { ...last, heading: bearingDeg(prev, last) };
}

function bearingDeg(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const y = Math.sin(((b.longitude - a.longitude) * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180);
  const x =
    Math.cos((a.latitude * Math.PI) / 180) * Math.sin((b.latitude * Math.PI) / 180) -
    Math.sin((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.cos(((b.longitude - a.longitude) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
