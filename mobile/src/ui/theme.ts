import { Platform } from "react-native";

/**
 * "Modernist" design tokens — flat, architectural, set in Archivo.
 * A near-mono red (#ec3013) on a light ground, a visible modular grid,
 * zero corner radius and strong 2px rules. Mirrors the design system's
 * styles.css 1:1 — retune the source there, then bring the values here.
 */
export const colors = {
  bg: "#f3f2f2",
  surface: "#eae9e9",
  // kept for call-site compatibility with the pre-existing components
  panel: "#eae9e9",
  panelAlt: "#f8f4f4",
  text: "#201e1d",
  // color-mix(in srgb, #201e1d 40%, transparent) — the system's --color-divider
  divider: "rgba(32, 30, 29, 0.4)",
  line: "rgba(32, 30, 29, 0.4)",
  // color-mix(in srgb, #201e1d 55%, transparent) — the system's .text-muted
  muted: "rgba(32, 30, 29, 0.55)",
  // color-mix(in srgb, #201e1d 70%, transparent) — the system's field-label tone
  inkSoft: "rgba(32, 30, 29, 0.7)",
  accent: "#ec3013",
  // --color-accent-600 — one step past the base, the ramp's "pressed" tone
  accentPressed: "#dd2b0f",
  // .btn-primary's label color is var(--color-bg), not white
  onAccent: "#f3f2f2",
  // color-mix(in srgb, var(--color-bg) 75%, transparent) — the same
  // ink-mix convention as `muted`/`inkSoft`, flipped for text sitting
  // directly on a solid accent field (the system's "poster" moments).
  onAccentSoft: "rgba(243, 242, 242, 0.75)",
  speak: "#ec3013",
  go: "#ec3013",
  stop: "#ec3013",
};

/** The accent's 100–900 tonal ramp, generated in OKLCH on one lightness scale. */
export const accentRamp = {
  100: "#fff2ef",
  200: "#ffe0d9",
  300: "#ffc4b8",
  400: "#ff9783",
  500: "#ff563c",
  600: "#dd2b0f",
  700: "#ae1800",
  800: "#7c1405",
  900: "#4d170e",
};

/** The neutral 100–900 tonal ramp. */
export const neutralRamp = {
  100: "#f8f4f4",
  200: "#eae7e7",
  300: "#d7d3d3",
  400: "#bab6b6",
  500: "#9b9797",
  600: "#7d7979",
  700: "#605d5d",
  800: "#444141",
  900: "#2d2b2b",
};

// --space-2 / --space-3 / --space-4 / --space-6 / --space-8
export const space = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
};

// --radius-sm / --radius-md / --radius-lg are all 0 — never round a corner.
export const radius = {
  btn: 0,
  card: 0,
  art: 0,
  pill: 0,
};

/** A strong 2px rule — never soften into a hairline. */
export const ruleWidth = 2;

export const fonts = {
  mark: Platform.select({ web: "Archivo, sans-serif", default: "System" }) ?? "System",
  body: Platform.select({ web: "Archivo, sans-serif", default: "System" }) ?? "System",
};

/** --font-heading-weight */
export const headingWeight = "800" as const;

export function ensureStudioFonts(): void {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (document.getElementById("rr-archivo")) return;
  const link = document.createElement("link");
  link.id = "rr-archivo";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&display=swap";
  document.head.appendChild(link);
}
