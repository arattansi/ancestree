import * as React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { font, usePalette } from "@/theme";

/** A choice that's on or off: a storyteller, someone mentioned. */
export function Chip({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        on
          ? { backgroundColor: palette.primary, borderColor: palette.primary }
          : { borderColor: palette.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: on ? palette.primaryForeground : palette.foreground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
  },
  text: { fontFamily: font.medium, fontSize: 15 },
});
