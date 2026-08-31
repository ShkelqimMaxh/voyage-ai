import { Pressable, StyleSheet, Text } from "react-native";

import { colors, fonts, headingWeight, radius, ruleWidth } from "../theme";

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
      style={({ pressed }) => [
        styles.btn,
        primary
          ? { backgroundColor: pressed ? colors.accentPressed : colors.accent }
          : {
              backgroundColor: "transparent",
              borderWidth: ruleWidth,
              borderColor: pressed ? colors.accent : colors.divider,
            },
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
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 18,
    flexGrow: 1,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 18,
    fontWeight: headingWeight,
  },
  disabled: { opacity: 0.45 },
});
