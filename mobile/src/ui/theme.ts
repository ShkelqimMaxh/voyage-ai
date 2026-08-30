import { Platform } from "react-native";

export const colors = {
  bg: "#141110",
  panel: "#1D1917",
  panelAlt: "#241F1D",
  line: "#322C29",
  text: "#F3F2F2",
  muted: "#9C948F",
  inkSoft: "#C9C3BF",
  accent: "#EC3013",
  accentPressed: "#B22410",
  speak: "#EC3013",
  go: "#EC3013",
  stop: "#EC3013",
};

export const space = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
};

export const radius = {
  btn: 18,
  card: 22,
  art: 12,
  pill: 100,
};

export const fonts = {
  mark: Platform.select({ web: "'Archivo Narrow', sans-serif", default: "System" }) ?? "System",
  body: Platform.select({ web: "Archivo, sans-serif", default: "System" }) ?? "System",
};

export function ensureStudioFonts(): void {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (document.getElementById("rr-archivo")) return;
  const link = document.createElement("link");
  link.id = "rr-archivo";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=Archivo+Narrow:wght@600;700&display=swap";
  document.head.appendChild(link);
}
