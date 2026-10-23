import * as React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { font, usePalette } from "@/theme";
import { XIcon } from "@/ui/icons";

/**
 * A choice that's on or off: a storyteller, someone mentioned. A
 * `removable` one is a choice already made, with a small x that says a tap
 * takes it off (Step 203).
 */
export function Chip({
  label,
  on,
  onPress,
  removable = false,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  removable?: boolean;
}) {
  const palette = usePalette();
  const color = on ? palette.primaryForeground : palette.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={removable ? undefined : { selected: on }}
      accessibilityLabel={removable ? `Remove ${label}` : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        removable && styles.removable,
        on
          ? { backgroundColor: palette.primary, borderColor: palette.primary }
          : { borderColor: palette.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.text, { color }]}>{label}</Text>
      {removable ? <XIcon size={14} color={color} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  removable: { paddingRight: 11 },
  text: { fontFamily: font.medium, fontSize: 15 },
});
