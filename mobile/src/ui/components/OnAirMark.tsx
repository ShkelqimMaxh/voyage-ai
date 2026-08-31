import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { colors, fonts, radius, ruleWidth } from "../theme";

const LABEL: Record<"standby" | "speaking" | "music", string> = {
  standby: "HOST STANDBY",
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
  // Live reverses to a solid accent field — the same fill/on-fill swap the
  // system uses for a checked segmented control or a pressed primary
  // button — rather than a merely outlined, easy-to-miss accent tint.
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
        <View style={[styles.dot, { backgroundColor: live ? colors.onAccent : colors.muted }]} />
      )}
      <Text style={[styles.label, { color: live ? colors.onAccent : colors.muted }]}>{LABEL[state]}</Text>
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
    paddingVertical: 6,
  },
  live: { backgroundColor: colors.accent, borderColor: colors.accent },
  standby: { borderColor: colors.divider },
  dot: { width: 9, height: 9, borderRadius: radius.pill },
  // A tiny live equalizer standing in for the host's voice — this is a
  // spoken-narration app, so "on air" should look like audio is actually
  // moving, not just a status light.
  bars: { flexDirection: "row", alignItems: "center", gap: 2, height: 12, width: 15 },
  bar: { width: 3, height: 12, backgroundColor: colors.onAccent },
  label: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.9,
  },
});
