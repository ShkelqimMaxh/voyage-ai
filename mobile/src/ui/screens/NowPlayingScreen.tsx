import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { paceFromSpeed } from "../../core/geo";
import type { Place } from "../../core/types";
import { TOPICS } from "../../core/types";
import { usePlayerStore } from "../../state/playerStore";
import { BigButton } from "../components/BigButton";
import { CarMap } from "../components/CarMap";
import { OnAirMark } from "../components/OnAirMark";
import { accentRamp, colors, fonts, headingWeight, radius, ruleWidth, space } from "../theme";

export function NowPlayingScreen() {
  const store = usePlayerStore();
  const place = store.context?.current ?? null;
  const onAir = store.live || store.demo;
  const speaking = store.phase === "speaking" || store.phase === "ducking";
  const mark = !onAir ? "standby" : speaking ? "speaking" : "music";

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
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <Text style={styles.mark}>{onAir ? "ROUTERADIO · VOYAGEFM" : "ROUTERADIO"}</Text>
          <OnAirMark state={mark} />
        </View>

        {onAir ? <OnAirBody store={store} place={place} speaking={speaking} /> : <IdleBody store={store} />}

        {store.error ? <Text style={styles.error}>{store.error}</Text> : null}

        {onAir ? <BelowFold store={store} place={place} /> : null}
      </ScrollView>
    </View>
  );
}

function IdleBody({ store }: { store: ReturnType<typeof usePlayerStore.getState> }) {
  return (
    <View style={styles.idle}>
      <View>
        <View style={styles.rule} />
        <Text style={styles.markIdle}>ROUTERADIO</Text>
        <Text style={styles.hero}>VoyageFM</Text>
        <Text style={styles.waiting}>Waiting for a road.</Text>
      </View>
      <View style={styles.startStack}>
        <BigButton label="Live GPS" tone="accent" onPress={() => void store.startLive()} />
        <BigButton label="Demo · Peja → Istog" onPress={() => void store.startDemo("peja-istog")} />
        <BigButton label="Demo · SF → Oakland" onPress={() => void store.startDemo("sf-oakland")} />
      </View>
    </View>
  );
}

function OnAirBody({
  store,
  place,
  speaking,
}: {
  store: ReturnType<typeof usePlayerStore.getState>;
  place: Place | null;
  speaking: boolean;
}) {
  const next = store.context?.nearby.find((item) => item.id !== place?.id);
  return (
    <View style={styles.onAir}>
      <Text style={styles.place} numberOfLines={2}>
        {place?.name ?? "This road"}
      </Text>
      <Text style={styles.hook} numberOfLines={1}>
        {hookFor(place)}
      </Text>
      <View style={styles.host}>
        <Text style={styles.hostTitle} numberOfLines={1}>
          {speaking ? store.script?.title ?? "On air" : "Music"}
        </Text>
        <Text style={styles.hostLine} numberOfLines={3}>
          {speaking
            ? hostLine(store.script?.spokenText)
            : next
              ? `Next up · ${next.name}. The host cuts back in and the music ducks.`
              : "The host cuts back in and the music ducks."}
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
}: {
  store: ReturnType<typeof usePlayerStore.getState>;
  place: Place | null;
}) {
  const pace = paceFromSpeed(store.point?.speedMps);
  const kmh = store.point?.speedMps != null ? Math.round(store.point.speedMps * 3.6) : 0;
  return (
    <View style={styles.below}>
      <CarMap
        point={store.point}
        label={place?.name}
        showDemoRoute={!store.live}
        route={store.demoPath}
      />
      <Text style={styles.telemetry}>
        {kmh} km/h
        {"  ·  "}
        {compass(store.point?.heading)}
        {"  ·  "}
        {pace}
        {"  ·  "}
        {store.live ? "GPS locked" : "Demo"}
      </Text>

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

function hookFor(place: Place | null): string {
  if (!place) return "Waiting for a road";
  const street = place.roadName?.trim();
  if (street) return street;
  if (place.neighbourhood && place.neighbourhood !== place.name) return place.neighbourhood;
  if (place.city && place.city !== place.name) return place.city;
  return place.kind;
}

function hostLine(text?: string | null): string {
  if (!text) return "Host standby";
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
    padding: 24,
    paddingTop: 52,
    paddingBottom: 48,
    gap: space.xl,
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    minHeight: "100%",
  },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  mark: {
    fontFamily: fonts.mark,
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 4.2,
  },
  idle: { flexGrow: 1, minHeight: 560, justifyContent: "space-between" },
  rule: { width: 56, height: 4, backgroundColor: colors.accent, marginTop: 120 },
  markIdle: {
    fontFamily: fonts.mark,
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 4.5,
    marginTop: 22,
  },
  hero: {
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 56,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 6,
    // The one poster moment on this screen — display-grade type carrying
    // the accent's neighbourhood, same license the system gives dividers
    // and closing banners.
  },
  waiting: {
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 18,
    fontWeight: "500",
    marginTop: 18,
  },
  startStack: { gap: 12 },
  onAir: { gap: 12 },
  place: {
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 44,
    fontWeight: "900",
    letterSpacing: -0.8,
    lineHeight: 46,
    marginTop: 36,
  },
  hook: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 17,
    fontWeight: "600",
    marginTop: 4,
  },
  host: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.xs,
    marginTop: space.md,
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
    fontSize: 17,
    fontWeight: "500",
    lineHeight: 25,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  below: { gap: 16, paddingTop: 8, borderTopWidth: ruleWidth, borderTopColor: colors.divider },
  telemetry: {
    fontFamily: fonts.body,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: ruleWidth,
    borderColor: colors.divider,
    borderRadius: radius.btn,
  },
  chipOn: { borderColor: colors.accent },
  chipText: { fontFamily: fonts.body, color: colors.inkSoft, fontWeight: "700", fontSize: 16 },
  chipTextOn: { color: colors.accent },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  // Paragraph-size text in the accent reads better a deep ramp step
  // (--color-accent-700) than the accent itself — the accent/ground pair
  // is only tuned to ~3:1, enough for chrome, not for body copy.
  error: { color: accentRamp[700], fontSize: 15, fontFamily: fonts.body },
});
