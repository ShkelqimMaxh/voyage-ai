import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { colors, fonts, radius } from "../theme";

export function OnAirMark({ state }: { state: "standby" | "speaking" | "music" }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state !== "speaking") {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 1300, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1300, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, state]);

  const live = state !== "standby";
  return (
    <View style={[styles.pill, live ? styles.live : styles.standby]}>
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: live ? colors.accent : colors.muted, opacity: pulse },
        ]}
      />
      <Text style={[styles.label, { color: live ? colors.accent : colors.muted }]}>
        {live ? "ON AIR" : "HOST STANDBY"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 2,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  live: { borderColor: colors.accent },
  standby: { borderColor: colors.line },
  dot: { width: 9, height: 9, borderRadius: 5 },
  label: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.9,
  },
});
