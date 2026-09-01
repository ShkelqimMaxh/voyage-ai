import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { paceFromSpeed } from "../../core/geo";
import type { Place } from "../../core/types";
import { TOPICS } from "../../core/types";
import { usePlayerStore } from "../../state/playerStore";
import { BigButton } from "../components/BigButton";
import { CarMap } from "../components/CarMap";
import { OnAirMark } from "../components/OnAirMark";
import {
  accentRamp,
  cardShadow,
  colors,
  fonts,
  headingWeight,
  radius,
  ruleWidth,
  scaleType,
  space,
} from "../theme";

// Breakpoints for the adaptive layout: compact phones tighten padding,
// anything tablet-width and up goes two-column so the map becomes a
// proper co-pilot panel instead of something below the fold.
const WIDE = 900;
const COMPACT = 380;

export function NowPlayingScreen() {
  const store = usePlayerStore();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const pad = width < COMPACT ? 16 : 24;
  const place = store.context?.current ?? null;
  const onAir = store.live || store.demo;
  const mark = !onAir ? "standby" : "speaking";

  useEffect(() => {
    if (onAir) {
      void activateKeepAwakeAsync("routeradio");
      return () => {
        void deactivateKeepAwake("routeradio");
      };
    }
    return undefined;
  }, [onAir]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: pad, maxWidth: isWide ? 1120 : 560 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <Text style={styles.mark}>{onAir ? "ROUTERADIO · VOYAGEFM" : "ROUTERADIO"}</Text>
          <OnAirMark state={mark} />
        </View>

        {onAir ? (
          <View style={isWide ? styles.columns : styles.stacked}>
            <View style={isWide ? styles.colMain : null}>
              <OnAirBody store={store} place={place} width={width} />
            </View>
            <View style={isWide ? styles.colSide : null}>
              <BelowFold store={store} place={place} isWide={isWide} />
            </View>
          </View>
        ) : (
          <IdleBody store={store} width={width} isWide={isWide} />
        )}

        {store.error ? <Text style={styles.error}>{store.error}</Text> : null}
      </ScrollView>
    </View>
  );
}

function IdleBody({
  store,
  width,
  isWide,
}: {
  store: ReturnType<typeof usePlayerStore.getState>;
  width: number;
  isWide: boolean;
}) {
  const heroSize = scaleType(width, 44, 76, 0.13);
  return (
    <View style={styles.idle}>
      <View style={[styles.poster, cardShadow]}>
        {/* Soft accent glows instead of a solid poster field — depth
            without a heavy block of flat color. */}
        <View style={styles.posterGlow} />
        <View style={styles.posterGlowLow} />
        <Text style={styles.markIdle}>ROUTERADIO</Text>
        <Text style={[styles.hero, { fontSize: heroSize, lineHeight: Math.round(heroSize * 1.05) }]}>
          VoyageFM
        </Text>
        <Text style={styles.waiting}>
          Your road, narrated live. Pick a route and the host takes it from there.
        </Text>
      </View>
      <View style={[styles.startStack, isWide && styles.startRow]}>
        <BigButton label="Live GPS" tone="accent" onPress={() => void store.startLive()} />
        <BigButton label="Demo · Peja → Istog" onPress={() => void store.startDemo("peja-istog")} />
        <BigButton label="Demo · SF → Oakland" onPress={() => void store.startDemo("sf-oakland")} />
        <BigButton label="Demo · Prishtina → Skopje" onPress={() => void store.startDemo("prishtina-skopje")} />
      </View>
    </View>
  );
}

function OnAirBody({
  store,
  place,
  width,
}: {
  store: ReturnType<typeof usePlayerStore.getState>;
  place: Place | null;
  width: number;
}) {
  const next = store.context?.nearby.find((item) => item.id !== place?.id);
  const placeSize = scaleType(width, 34, 56, 0.095);
  return (
    <View style={styles.onAir}>
      <View>
        <Text
          style={[styles.place, { fontSize: placeSize, lineHeight: Math.round(placeSize * 1.08) }]}
          numberOfLines={2}
        >
          {place?.name ?? "This road"}
        </Text>
        <Text style={styles.hook} numberOfLines={1}>
          {hookFor(place)}
        </Text>
      </View>
      <View style={[styles.host, cardShadow]}>
        <Text style={styles.cardKicker}>ON AIR</Text>
        <Text style={styles.hostTitle} numberOfLines={1}>
          {store.script?.title ?? "Coming on air"}
        </Text>
        <Text style={styles.hostLine} numberOfLines={3}>
          {store.script
            ? hostLine(store.script.spokenText)
            : next
              ? `Coming on through ${next.name}. Stay with the station.`
              : "The host is coming on. Stay with the station."}
        </Text>
      </View>
      <View style={styles.grid}>
        <BigButton label="Stop" tone="stop" onPress={() => void store.stop()} />
        <BigButton label="Skip" onPress={() => void store.skipNarration()} />
        <BigButton label="Re-roll" onPress={() => void store.rerollTopic()} />
        <BigButton label="Tell me more" onPress={() => void store.tellMeMore()} />
      </View>
    </View>
  );
}

function BelowFold({
  store,
  place,
  isWide,
}: {
  store: ReturnType<typeof usePlayerStore.getState>;
  place: Place | null;
  isWide: boolean;
}) {
  const pace = paceFromSpeed(store.point?.speedMps);
  const kmh = store.point?.speedMps != null ? Math.round(store.point.speedMps * 3.6) : 0;
  return (
    <View style={styles.below}>
      <View style={[styles.instrument, cardShadow]}>
        <CarMap
          point={store.point}
          label={place?.name}
          showDemoRoute={!store.live}
          route={store.demoPath}
          framed={false}
          height={isWide ? 320 : 210}
        />
        <View style={styles.hairline} />
        <View style={styles.statRow}>
          <StatCell label="Speed" value={`${kmh}`} unit="km/h" lead />
          <View style={styles.statDivider} />
          <StatCell label="Heading" value={compass(store.point?.heading)} />
          <View style={styles.statDivider} />
          <StatCell label="Pace" value={pace} />
          <View style={styles.statDivider} />
          <StatCell label="Source" value={store.live ? "Live" : "Demo"} lead={store.live} />
        </View>
      </View>

      <View style={styles.chips}>
        {TOPICS.filter((topic) => ["surprise", "food", "history", "culture"].includes(topic.id)).map((topic) => {
          const active = store.topic === topic.id;
          return (
            <Pressable
              key={topic.id}
              onPress={() => store.setTopic(topic.id)}
              style={[styles.chip, active && styles.chipOn]}
            >
              <Text style={[styles.chipText, active && styles.chipTextOn]}>{topic.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.row}>
        <BigButton
          label="Built-in radio"
          tone={store.audioMode === "builtin" ? "accent" : "panel"}
          onPress={() => void store.setAudioMode("builtin")}
        />
        <BigButton
          label="Duck Spotify / AM"
          tone={store.audioMode === "external" ? "accent" : "panel"}
          onPress={() => void store.setAudioMode("external")}
        />
      </View>
    </View>
  );
}

// Equal-width instrument cells — a big numeral over a small tracked label.
// This is a driving companion, so its live telemetry gets read as data,
// not tucked away as a caption.
function StatCell({ label, value, unit, lead }: { label: string; value: string; unit?: string; lead?: boolean }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, lead && styles.statValueLead]} numberOfLines={1}>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function hookFor(place: Place | null): string {
  if (!place) return "Waiting for a road";
  const street = place.roadName?.trim();
  if (street) return street;
  if (place.neighbourhood && place.neighbourhood !== place.name) return place.neighbourhood;
  if (place.city && place.city !== place.name) return place.city;
  return place.kind;
}

function hostLine(text?: string | null): string {
  if (!text) return "The host is coming on. Stay with the station.";
  const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  const take = parts.slice(0, 3).join(" ");
  return take.length > 240 ? `${take.slice(0, 237).trimEnd()}…` : take;
}

function compass(deg?: number | null): string {
  if (deg == null || Number.isNaN(deg)) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    paddingTop: 56,
    paddingBottom: 48,
    gap: space.xl,
    width: "100%",
    alignSelf: "center",
    minHeight: "100%",
  },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  mark: {
    fontFamily: fonts.mark,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 3.6,
  },
  // Two-column co-pilot layout on wide screens; single fluid column otherwise.
  columns: { flexDirection: "row", gap: space.xl, alignItems: "flex-start" },
  colMain: { flex: 1, minWidth: 0 },
  colSide: { flex: 1, minWidth: 0 },
  stacked: { gap: space.xl },
  idle: { flexGrow: 1, minHeight: 560, justifyContent: "space-between", gap: space.xl },
  poster: {
    backgroundColor: colors.panelAlt,
    borderRadius: radius.card,
    borderWidth: ruleWidth,
    borderColor: colors.divider,
    paddingHorizontal: 28,
    paddingTop: 44,
    paddingBottom: 40,
    overflow: "hidden",
  },
  posterGlow: {
    position: "absolute",
    top: -140,
    right: -90,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: colors.accent,
    opacity: 0.18,
  },
  posterGlowLow: {
    position: "absolute",
    bottom: -160,
    left: -110,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.accent,
    opacity: 0.08,
  },
  markIdle: {
    fontFamily: fonts.mark,
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 4,
  },
  hero: {
    fontFamily: fonts.body,
    color: colors.text,
    fontWeight: "900",
    letterSpacing: -1.5,
    marginTop: 8,
  },
  waiting: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 17,
    fontWeight: "500",
    lineHeight: 25,
    marginTop: 16,
    maxWidth: 420,
  },
  startStack: { gap: 12 },
  startRow: { flexDirection: "row", flexWrap: "wrap" },
  onAir: { gap: space.md },
  place: {
    fontFamily: fonts.body,
    color: colors.text,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginTop: 12,
  },
  hook: {
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 17,
    fontWeight: "600",
    marginTop: 6,
  },
  host: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: ruleWidth,
    borderColor: colors.divider,
    padding: space.lg,
    gap: space.xs,
  },
  cardKicker: {
    fontFamily: fonts.body,
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  hostTitle: {
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 21,
    fontWeight: headingWeight,
  },
  hostLine: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 24,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  below: { gap: space.md },
  // Map + live telemetry as one rounded instrument card.
  instrument: {
    borderWidth: ruleWidth,
    borderColor: colors.divider,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  hairline: { height: ruleWidth, backgroundColor: colors.divider },
  statRow: { flexDirection: "row" },
  statCell: { flex: 1, paddingVertical: space.sm, paddingHorizontal: space.sm },
  statDivider: { width: ruleWidth, backgroundColor: colors.divider },
  statValue: {
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 20,
    fontWeight: headingWeight,
  },
  statValueLead: { color: colors.accent },
  statUnit: {
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  statLabel: {
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 2,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderWidth: ruleWidth,
    borderColor: colors.divider,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  chipText: { fontFamily: fonts.body, color: colors.inkSoft, fontWeight: "700", fontSize: 15 },
  chipTextOn: { color: colors.accent },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  // Light ramp step for body-size text on the dark ground — the raw accent
  // is tuned for chrome, not paragraphs.
  error: { color: accentRamp[300], fontSize: 15, fontFamily: fonts.body },
});
