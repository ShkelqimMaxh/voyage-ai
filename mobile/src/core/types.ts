export type Topic =
  | "history"
  | "landscape"
  | "geology"
  | "food"
  | "culture"
  | "road"
  | "weather"
  | "surprise";

export type DrivePace = "crawl" | "urban" | "rural" | "highway";

export type AudioMode = "builtin" | "external";

export type PlayerPhase = "idle" | "music" | "ducking" | "speaking" | "restoring";

export interface GeoPoint {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speedMps?: number | null;
  altitudeM?: number | null;
  timestamp: number;
}

export interface Place {
  id: string;
  name: string;
  kind: string;
  country?: string | null;
  region?: string | null;
  municipality?: string | null;
  city?: string | null;
  neighbourhood?: string | null;
  latitude: number;
  longitude: number;
  osmId?: string | null;
  distanceM?: number | null;
  summary?: string | null;
  addressLine?: string | null;
  wikipediaTitle?: string | null;
  wikipediaExtract?: string | null;
  landmarks?: string[];
  facts?: string[];
  roadName?: string | null;
}

export interface PlaceContext {
  current: Place | null;
  nearby: Place[];
  region: Place | null;
  source: string;
}

export interface NarrationScript {
  id: string;
  placeId: string;
  topic: Topic;
  title: string;
  spokenText: string;
  durationHintS: number;
  bridgeIn: string;
  tags: string[];
  /** One short line naming what this clip taught, kept as the next clip's memory. */
  covered?: string;
  /** The backend found nothing unaired for this place; skip rather than repeat. */
  duplicate?: boolean;
  cached: boolean;
  source: "claude" | "openai" | "gemini" | "knowledge" | "wikipedia" | "cache" | "device";
  audioUrl?: string | null;
}

export interface BoundaryEvent {
  previous: Place | null;
  current: Place;
  point: GeoPoint;
  pace: DrivePace;
}

export const TOPICS: { id: Topic; label: string }[] = [
  { id: "surprise", label: "Surprise" },
  { id: "history", label: "History" },
  { id: "landscape", label: "Landscape" },
  { id: "geology", label: "Geology" },
  { id: "food", label: "Food" },
  { id: "culture", label: "Culture" },
  { id: "road", label: "Road" },
  { id: "weather", label: "Weather" },
];
