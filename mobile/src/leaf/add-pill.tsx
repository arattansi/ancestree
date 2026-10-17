import * as React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import type { OrbitPill, PillSize } from "@/lib/leaf-orbit";
import { font, usePalette } from "@/theme";
import { PlusIcon } from "@/ui/icons";

/**
 * Where a leaf has no parents, or no children, and the member may add them
 * (Step 187): a dashed, empty pill in the row's place, "+ parent" or
 * "+ child", quieter than a relative's. A tap opens the add form with that
 * relation chosen.
 */
export function AddPill({
  pill,
  size,
  word,
  label,
  onPress,
}: {
  pill: OrbitPill;
  size: PillSize;
  /** "parent" or "child". */
  word: string;
  /** What VoiceOver says: "Add Amina's parent". */
  label: string;
  onPress: () => void;
}) {
  const palette = usePalette();
  const { width, height } = size;
  // As a relative's pill sizes its name.
  const text = Math.round(13 * Math.min(1, height / 32) * 2) / 2;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.pill,
        {
          left: pill.x - width / 2,
          top: pill.y - height / 2,
          width,
          height,
          borderRadius: height / 2,
          backgroundColor: palette.background,
          borderColor: palette.mutedForeground,
          opacity: pressed ? 0.5 : 0.8,
        },
      ]}
    >
      <PlusIcon size={text} color={palette.mutedForeground} />
      <Text numberOfLines={1} style={[styles.word, { fontSize: text, color: palette.mutedForeground }]}>
        {word}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderStyle: "dashed",
  },
  word: { fontFamily: font.medium },
});
