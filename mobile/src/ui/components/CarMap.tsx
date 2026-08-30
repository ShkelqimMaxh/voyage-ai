import { useEffect, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import type { GeoPoint } from "../../core/types";
import { PEJA_ISTOG_ROAD_WAYPOINTS } from "../../engine/location/pejaIstogDemo";
import { colors, radius } from "../theme";

const MAP_HOST_ID = "routeradio-car-map";

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
      height: 150px;
      background: #1D1917;
    }
    #${MAP_HOST_ID} img,
    #${MAP_HOST_ID} .leaflet-tile,
    #${MAP_HOST_ID} .leaflet-tile-loaded {
      max-width: none !important;
      max-height: none !important;
      opacity: 1 !important;
    }
    #${MAP_HOST_ID} .leaflet-tile-pane {
      filter: grayscale(1) contrast(1.08);
    }
  `;
  document.head.appendChild(fix);
}

export function CarMap({
  point,
  label,
  showDemoRoute,
  route = PEJA_ISTOG_ROAD_WAYPOINTS,
}: {
  point: GeoPoint | null;
  label?: string;
  showDemoRoute?: boolean;
  route?: Array<{ latitude: number; longitude: number }>;
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
      host.style.height = "150px";
      host.style.width = "100%";
      const map = L.map(host, {
        zoomControl: true,
        attributionControl: false,
        fadeAnimation: false,
      }).setView([start.latitude, start.longitude], 16);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        detectRetina: false,
      }).addTo(map);
      if (showDemoRoute) {
        L.polyline(
          route.map((item) => [item.latitude, item.longitude]),
          { color: "#EC3013", weight: 4, opacity: 0.95 },
        ).addTo(map);
      }
      markerRef.current = L.circleMarker([start.latitude, start.longitude], {
        radius: 9,
        color: "#141110",
        weight: 2,
        fillColor: "#EC3013",
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

  useEffect(() => {
    if (!point || !mapRef.current || !markerRef.current) return;
    const next: [number, number] = [point.latitude, point.longitude];
    markerRef.current.setLatLng(next);
    mapRef.current.setView(next, Math.max(mapRef.current.getZoom(), 16), { animate: true });
  }, [point?.latitude, point?.longitude]);

  const caption = point
    ? `${label ?? "On the road"}`
    : "Map · route line only";

  if (Platform.OS !== "web") {
    return (
      <View style={styles.shell}>
        <Text style={styles.caption}>{caption}</Text>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <View nativeID={MAP_HOST_ID} style={styles.canvas} />
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: colors.panel,
    borderRadius: radius.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
  },
  canvas: { width: "100%", height: 150, backgroundColor: "#1D1917" },
  caption: {
    color: colors.muted,
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
