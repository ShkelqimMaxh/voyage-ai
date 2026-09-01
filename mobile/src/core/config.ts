import { Platform } from "react-native";

function env(name: string, fallback = ""): string {
  const value = (process.env as Record<string, string | undefined>)[name];
  return value && value.length > 0 ? value : fallback;
}

const localhost = Platform.select({
  android: "http://10.0.2.2:8000",
  default: "http://localhost:8000",
});

function apiUrl(): string {
  const fromEnv = env("EXPO_PUBLIC_API_URL");
  if (typeof window !== "undefined") {
    const pageHost = window.location.hostname;
    const onDevice = Boolean(pageHost) && !/localhost|127\.0\.0\.1/.test(pageHost);
    // EXPO_PUBLIC_API_URL is baked in at bundle time and defaults to the dev
    // machine's own loopback address. That's unreachable from a phone that
    // loaded the page over LAN (or is out driving on cellular) — every
    // request fails silently and the host never says a word. If the page
    // itself isn't on localhost, prefer the page's own host/origin instead.
    if (onDevice) {
      if (fromEnv && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(fromEnv)) {
        return fromEnv.replace(/(localhost|127\.0\.0\.1)/, pageHost);
      }
      const origin = window.location.origin;
      if (!fromEnv && origin) return origin;
    }
  }
  if (fromEnv) return fromEnv;
  return localhost ?? "http://localhost:8000";
}

export const config = {
  apiUrl: apiUrl(),
  anthropicKey: env("EXPO_PUBLIC_ANTHROPIC_API_KEY"),
  elevenLabsKey: env("EXPO_PUBLIC_ELEVENLABS_API_KEY"),
  elevenLabsVoice: env("EXPO_PUBLIC_ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"),
  mapboxToken: env("EXPO_PUBLIC_MAPBOX_TOKEN"),
  demoRouteId: env("EXPO_PUBLIC_DEMO_ROUTE", "peja-istog"),
  geocodeMinIntervalMs: 12_000,
  boundaryMinDwellMs: 8_000,
  duckLevel: 0.18,
  duckMs: 220,
  restoreMs: 380,
  lookaheadSeconds: 90,
};
