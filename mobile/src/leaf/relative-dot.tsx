import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { NAME_H, NAME_W, type OrbitDot } from "@/lib/leaf-orbit";
import { personInitials } from "@/lib/person-name";
import type { FamilyPerson } from "@/family/load";
import { font, usePalette } from "@/theme";

/**
 * A relative one line from the leaf: a small circle with their initials and,
 * when there's room, their first name (above the circle in the parents'
 * row, below it elsewhere, so the line to the leaf never crosses it). A
 * circle for someone who has died is dashed, as their leaf's outline is.
 */
export function RelativeDot({
  dot,
  size,
  named,
  person,
  label,
  onPress,
}: {
  dot: OrbitDot;
  size: number;
  named: boolean;
  /** Null on the "+n" circle. */
  person: FamilyPerson | null;
  /** What VoiceOver says: "Mother, Amina Jaffer". */
  label: string;
  onPress: () => void;
}) {
  const palette = usePalette();
  const deceased = !!person && (!!person.is_deceased || !!person.date_of_death);
  const first = person
    ? (person.preferred_name || person.first_name || person.last_name || "").trim()
    : "";
  const width = named ? Math.max(size, NAME_W) : size;
  const nameAbove = dot.side === "parents";
  const top = nameAbove && named ? dot.y - size / 2 - NAME_H : dot.y - size / 2;

  const name = named ? (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.75}
      style={[styles.name, { color: palette.foreground, width }]}
    >
      {person ? first || "—" : `${dot.more} more`}
    </Text>
  ) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.cell,
        { left: dot.x - width / 2, top, width, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      {nameAbove ? name : null}
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: person ? palette.card : palette.muted,
            borderColor: palette.green,
            borderStyle: deceased ? "dashed" : "solid",
          },
        ]}
      >
        <Text
          style={[
            styles.initials,
            {
              fontSize: size * 0.34,
              color: deceased ? palette.mutedForeground : palette.foreground,
            },
          ]}
        >
          {person ? personInitials(person) : `+${dot.more}`}
        </Text>
      </View>
      {nameAbove ? null : name}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: { position: "absolute", alignItems: "center" },
  circle: {
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { fontFamily: font.semibold },
  name: {
    height: NAME_H,
    lineHeight: NAME_H,
    textAlign: "center",
    fontFamily: font.medium,
    fontSize: 13,
  },
});
