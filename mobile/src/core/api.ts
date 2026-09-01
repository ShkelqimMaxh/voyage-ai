import { config } from "./config";
import type { DrivePace, GeoPoint, NarrationScript, Place, PlaceContext, Topic } from "./types";

async function request<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function toPlace(raw: Record<string, unknown> | null): Place | null {
  if (!raw) return null;
  return {
    id: String(raw.id),
    name: String(raw.name),
    kind: String(raw.kind),
    country: (raw.country as string | null) ?? null,
    region: (raw.region as string | null) ?? null,
    municipality: (raw.municipality as string | null) ?? null,
    city: (raw.city as string | null) ?? null,
    neighbourhood: (raw.neighbourhood as string | null) ?? null,
    latitude: Number(raw.latitude),
    longitude: Number(raw.longitude),
    osmId: (raw.osm_id as string | null) ?? null,
    distanceM: raw.distance_m == null ? null : Number(raw.distance_m),
    summary: (raw.summary as string | null) ?? null,
    addressLine: (raw.address_line as string | null) ?? null,
    wikipediaTitle: (raw.wikipedia_title as string | null) ?? null,
    wikipediaExtract: (raw.wikipedia_extract as string | null) ?? null,
    landmarks: (raw.landmarks as string[]) ?? [],
    facts: (raw.facts as string[]) ?? [],
    roadName: (raw.road_name as string | null) ?? null,
  };
}

export async function resolvePlaces(point: GeoPoint): Promise<PlaceContext> {
  const data = await request<Record<string, unknown>>("/v1/places/resolve", {
    point: {
      latitude: point.latitude,
      longitude: point.longitude,
      heading: point.heading,
      speed_mps: point.speedMps,
    },
    lookahead_seconds: config.lookaheadSeconds,
  });
  return {
    current: toPlace((data.current as Record<string, unknown>) ?? null),
    nearby: ((data.nearby as Record<string, unknown>[]) ?? [])
      .map((item) => toPlace(item))
      .filter((item): item is Place => item !== null),
    region: toPlace((data.region as Record<string, unknown>) ?? null),
    source: String(data.source ?? "knowledge"),
  };
}

export async function generateScript(input: {
  place: Place;
  topic: Topic;
  pace: DrivePace;
  weather?: string;
  expand?: boolean;
  previousPlaceIds?: string[];
  alreadySaid?: string[];
  alreadyCoveredHere?: string[];
  continuation?: boolean;
}): Promise<NarrationScript> {
  const data = await request<Record<string, unknown>>("/v1/scripts/generate", {
    place: {
      id: input.place.id,
      name: input.place.name,
      kind: input.place.kind,
      country: input.place.country,
      region: input.place.region,
      municipality: input.place.municipality,
      city: input.place.city,
      neighbourhood: input.place.neighbourhood,
      latitude: input.place.latitude,
      longitude: input.place.longitude,
      osm_id: input.place.osmId,
      distance_m: input.place.distanceM,
      summary: input.place.summary,
      wikipedia_title: input.place.wikipediaTitle,
      wikipedia_extract: input.place.wikipediaExtract,
      landmarks: input.place.landmarks ?? [],
      facts: input.place.facts ?? [],
      road_name: input.place.roadName ?? null,
    },
    topic: input.topic,
    pace: input.pace,
    weather: input.weather,
    locale: "en",
    expand: Boolean(input.expand),
    previous_place_ids: input.previousPlaceIds ?? [],
    already_said: input.alreadySaid ?? [],
    already_covered_here: input.alreadyCoveredHere ?? [],
    continuation: Boolean(input.continuation),
  });
  return {
    id: String(data.id),
    placeId: String(data.place_id),
    topic: data.topic as Topic,
    title: String(data.title),
    spokenText: String(data.spoken_text),
    durationHintS: Number(data.duration_hint_s),
    bridgeIn: String(data.bridge_in),
    tags: (data.tags as string[]) ?? [],
    covered: String(data.covered ?? ""),
    cached: Boolean(data.cached),
    source: data.source as NarrationScript["source"],
  };
}

export async function renderTts(script: NarrationScript): Promise<string | null> {
  const data = await request<{ audio_url?: string | null }>("/v1/tts/render", {
    script_id: script.id,
    text: script.spokenText,
    provider: "auto",
  });
  if (!data.audio_url) return null;
  if (data.audio_url.startsWith("http")) return data.audio_url;
  return `${config.apiUrl}${data.audio_url}`;
}

export async function prefetchRoute(
  polyline: GeoPoint[],
  topics: Topic[] = ["history", "landscape"],
): Promise<{ places: Place[]; scripts: NarrationScript[] }> {
  const data = await request<{
    places: Record<string, unknown>[];
    scripts: Record<string, unknown>[];
  }>("/v1/prefetch/route", {
    polyline: polyline.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      heading: point.heading,
      speed_mps: point.speedMps,
    })),
    topics,
    sample_meters: 1400,
  });
  return {
    places: data.places.map((item) => toPlace(item)).filter((item): item is Place => item !== null),
    scripts: data.scripts.map((item) => ({
      id: String(item.id),
      placeId: String(item.place_id),
      topic: item.topic as Topic,
      title: String(item.title),
      spokenText: String(item.spoken_text),
      durationHintS: Number(item.duration_hint_s),
      bridgeIn: String(item.bridge_in),
      tags: (item.tags as string[]) ?? [],
      cached: Boolean(item.cached),
      source: item.source as NarrationScript["source"],
    })),
  };
}
