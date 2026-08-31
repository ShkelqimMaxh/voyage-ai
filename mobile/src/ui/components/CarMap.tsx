import { useEffect, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import type { GeoPoint } from "../../core/types";
import { PEJA_ISTOG_ROAD_WAYPOINTS } from "../../engine/location/pejaIstogDemo";
import { colors, radius, ruleWidth } from "../theme";

const MAP_HOST_ID = "routeradio-car-map";
const DEFAULT_MAP_HEIGHT = 220;

function ensureLeafletCss(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("leaflet-css")) return;
  const link = document.createElement("link");
  link.id = "leaflet-css";
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);
  const fix = document.createElement("style");
  fix.id = "leaflet-rn-fix";
  fix.textContent = `
    #${MAP_HOST_ID}, #${MAP_HOST_ID} .leaflet-container {
      width: 100%;
      height: 100%;
      background: ${colors.surface};
    }
    #${MAP_HOST_ID} img,
    #${MAP_HOST_ID} .leaflet-tile,
    #${MAP_HOST_ID} .leaflet-tile-loaded {
      max-width: none !important;
      max-height: none !important;
      opacity: 1 !important;
    }
    #${MAP_HOST_ID} .leaflet-control-zoom a {
      background: ${colors.panelAlt};
      color: ${colors.text};
      border-color: rgba(244, 246, 249, 0.12);
    }
  `;
  document.head.appendChild(fix);
}

export function CarMap({
  point,
  label,
  showDemoRoute,
  route = PEJA_ISTOG_ROAD_WAYPOINTS,
  framed = true,
  height = DEFAULT_MAP_HEIGHT,
}: {
  point: GeoPoint | null;
  label?: string;
  showDemoRoute?: boolean;
  route?: Array<{ latitude: number; longitude: number }>;
  /** Set false when nesting inside another framed block (e.g. the instrument cluster) so borders don't double up. */
  framed?: boolean;
  /** Adaptive: give the map more screen weight on wide layouts. */
  height?: number;
}) {
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").CircleMarker | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let cancelled = false;
    const boot = async (tries = 0) => {
      const host = typeof document !== "undefined" ? document.getElementById(MAP_HOST_ID) : null;
      if (!host) {
        if (tries < 20 && !cancelled) setTimeout(() => void boot(tries + 1), 50);
        return;
      }
      ensureLeafletCss();
      const L = await import("leaflet");
      if (cancelled || mapRef.current) return;
      const start = point ?? route[0] ?? PEJA_ISTOG_ROAD_WAYPOINTS[0];
      host.style.height = "100%";
      host.style.width = "100%";
      const map = L.map(host, {
        zoomControl: true,
        attributionControl: false,
        fadeAnimation: false,
      }).setView([start.latitude, start.longitude], 16);
      // Dark basemap to match the car-mode UI — the accent route line and
      // marker pop against it instead of fighting a bright street map.
      L.tileLayer("https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        detectRetina: false,
      }).addTo(map);
      if (showDemoRoute) {
        L.polyline(
          route.map((item) => [item.latitude, item.longitude]),
          { color: colors.accent, weight: 4, opacity: 0.95 },
        ).addTo(map);
      }
      markerRef.current = L.circleMarker([start.latitude, start.longitude], {
        radius: 9,
        color: colors.text,
        weight: 2,
        fillColor: colors.accent,
        fillOpacity: 1,
      }).addTo(map);
      mapRef.current = map;
      requestAnimationFrame(() => map.invalidateSize());
    };
    void boot();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [showDemoRoute, route]);

  // Keep tiles filling the canvas when the adaptive layout resizes it.
  useEffect(() => {
    if (!mapRef.current) return;
    requestAnimationFrame(() => mapRef.current?.invalidateSize());
  }, [height]);

  useEffect(() => {
    if (!point || !mapRef.current || !markerRef.current) return;
    const next: [number, number] = [point.latitude, point.longitude];
    markerRef.current.setLatLng(next);
    mapRef.current.setView(next, Math.max(mapRef.current.getZoom(), 16), { animate: true });
  }, [point?.latitude, point?.longitude]);

  if (Platform.OS !== "web") {
    return (
      <View style={[styles.shell, framed && styles.framed]}>
        <Text style={styles.caption}>{point ? label ?? "On the road" : "Map · route line only"}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.shell, framed && styles.framed]}>
      <View nativeID={MAP_HOST_ID} style={[styles.canvas, { height }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    overflow: "hidden",
  },
  framed: { borderWidth: ruleWidth, borderColor: colors.divider },
  canvas: { width: "100%", backgroundColor: colors.surface },
  caption: {
    color: colors.muted,
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
