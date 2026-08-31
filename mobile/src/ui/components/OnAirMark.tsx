import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { colors, fonts, radius, ruleWidth } from "../theme";

const LABEL: Record<"standby" | "speaking" | "music", string> = {
  standby: "STANDBY",
  speaking: "ON AIR",
  music: "MUSIC",
};

function useLevel(seed: number, active: boolean) {
  const value = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    if (!active) {
      value.setValue(0.3);
      return;
    }
    const up = 220 + seed * 70;
    const down = 260 - seed * 40;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: up, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0.25, duration: down, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, seed, value]);
  return value;
}

export function OnAirMark({ state }: { state: "standby" | "speaking" | "music" }) {
  const speaking = state === "speaking";
  // Live gets a tinted accent pill — a soft fill plus an accent stroke —
  // the modern "status chip" treatment, instead of a solid poster block.
  const live = state !== "standby";

  const bar1 = useLevel(0, speaking);
  const bar2 = useLevel(1, speaking);
  const bar3 = useLevel(2, speaking);

  return (
    <View style={[styles.pill, live ? styles.live : styles.standby]}>
      {speaking ? (
        <View style={styles.bars}>
          <Animated.View style={[styles.bar, { transform: [{ scaleY: bar1 }] }]} />
          <Animated.View style={[styles.bar, { transform: [{ scaleY: bar2 }] }]} />
          <Animated.View style={[styles.bar, { transform: [{ scaleY: bar3 }] }]} />
        </View>
      ) : (
        <View style={[styles.dot, { backgroundColor: live ? colors.accent : colors.muted }]} />
      )}
      <Text style={[styles.label, { color: live ? colors.accent : colors.muted }]}>{LABEL[state]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: ruleWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  live: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  standby: { borderColor: colors.divider, backgroundColor: colors.surface },
  dot: { width: 9, height: 9, borderRadius: radius.pill },
  // A tiny live equalizer standing in for the host's voice — this is a
  // spoken-narration app, so "on air" should look like audio is moving.
  bars: { flexDirection: "row", alignItems: "center", gap: 2, height: 12, width: 15 },
  bar: { width: 3, height: 12, borderRadius: 2, backgroundColor: colors.accent },
  label: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.6,
  },
});
