import { Pressable, StyleSheet, Text } from "react-native";

import { colors, fonts, radius, ruleWidth } from "../theme";

export function BigButton({
  label,
  onPress,
  tone = "panel",
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone?: "panel" | "accent" | "go" | "stop";
  disabled?: boolean;
}) {
  const primary = tone === "accent" || tone === "go" || tone === "stop";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: primary ? colors.onAccentSoft : colors.accentSoft }}
      style={({ pressed }) => [
        styles.btn,
        primary
          ? { backgroundColor: pressed ? colors.accentPressed : colors.accent }
          : {
              backgroundColor: pressed ? colors.panelAlt : colors.surface,
              borderWidth: ruleWidth,
              borderColor: pressed ? colors.accentBorder : colors.divider,
            },
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text style={[styles.label, { color: primary ? colors.onAccent : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 56,
    minWidth: 120,
    borderRadius: radius.btn,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    flexGrow: 1,
    flexBasis: 140,
    overflow: "hidden",
  },
  pressed: { transform: [{ scale: 0.98 }] },
  label: {
    fontFamily: fonts.body,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  disabled: { opacity: 0.45 },
});
