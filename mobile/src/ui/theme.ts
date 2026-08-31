import { Platform } from "react-native";

/**
 * Modern dark "car mode" design tokens.
 * A near-black blue ground, soft elevated cards, hairline borders and one
 * warm signal accent (#FF5A3C). Rounded geometry throughout, set in Inter.
 * Tuned for glanceability while driving: big type, high contrast, dark UI.
 */
export const colors = {
  bg: "#0A0C10",
  surface: "#12161F",
  // kept for call-site compatibility with the pre-existing components
  panel: "#12161F",
  panelAlt: "#1A1F2A",
  text: "#F4F6F9",
  // hairline strokes on dark — borders should whisper, not shout
  divider: "rgba(244, 246, 249, 0.10)",
  line: "rgba(244, 246, 249, 0.10)",
  muted: "rgba(244, 246, 249, 0.55)",
  inkSoft: "rgba(244, 246, 249, 0.74)",
  accent: "#FF5A3C",
  accentPressed: "#E8462A",
  // tinted fills/strokes for chips, pills and "live" states
  accentSoft: "rgba(255, 90, 60, 0.14)",
  accentBorder: "rgba(255, 90, 60, 0.45)",
  // dark ink on the bright accent — reads stronger than white at this hue
  onAccent: "#180804",
  onAccentSoft: "rgba(24, 8, 4, 0.72)",
  speak: "#FF5A3C",
  go: "#FF5A3C",
  stop: "#FF5A3C",
};

/** The accent's 100–900 tonal ramp (100 lightest → 900 darkest). */
export const accentRamp = {
  100: "#fff2ef",
  200: "#ffe0d9",
  300: "#ffc4b8",
  400: "#ff9783",
  500: "#ff5a3c",
  600: "#e8462a",
  700: "#b52c14",
  800: "#801f0e",
  900: "#4d170e",
};

/** The neutral 100–900 tonal ramp (dark-UI oriented). */
export const neutralRamp = {
  100: "#f4f6f9",
  200: "#d9dde4",
  300: "#b3b9c4",
  400: "#8b92a0",
  500: "#666d7c",
  600: "#484f5d",
  700: "#2e3441",
  800: "#1a1f2a",
  900: "#12161f",
};

export const space = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
};

/** Rounded, friendly geometry — cards a step softer than buttons. */
export const radius = {
  btn: 16,
  card: 20,
  art: 16,
  pill: 999,
};

/** Hairline strokes only — depth comes from surface steps, not heavy rules. */
export const ruleWidth = 1;

/** Soft ambient elevation for cards (no-op on web-less platforms without shadows). */
export const cardShadow = {
  shadowColor: "#000000",
  shadowOpacity: 0.35,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 12 },
  elevation: 8,
} as const;

export const fonts = {
  mark: Platform.select({ web: "Inter, system-ui, sans-serif", default: "System" }) ?? "System",
  body: Platform.select({ web: "Inter, system-ui, sans-serif", default: "System" }) ?? "System",
};

export const headingWeight = "800" as const;

/**
 * Adaptive type scale — clamp(min, vw-based, max) done by hand so the same
 * screen reads right on a small phone, a tablet and a desktop window.
 */
export function scaleType(width: number, min: number, max: number, factor: number): number {
  return Math.round(Math.min(max, Math.max(min, width * factor)));
}

export function ensureStudioFonts(): void {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (document.getElementById("rr-inter")) return;
  const link = document.createElement("link");
  link.id = "rr-inter";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap";
  document.head.appendChild(link);
}
