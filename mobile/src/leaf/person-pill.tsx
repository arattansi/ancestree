import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { OrbitPill, PillSize } from "@/lib/leaf-orbit";
import { personInitials } from "@/lib/person-name";
import type { FamilyPerson } from "@/family/load";
import { font, usePalette } from "@/theme";

/**
 * A relative one line from the leaf (Step 179.2): a gray pill with their
 * first name, and their initials cut out of a dark disc at its right end, in
 * negative space (Aalim: "a gray pill with the first name and their initials
 * in negative space, right-aligned on the pill"). A pill for someone who has
 * died has a dashed edge, as their leaf's outline is; the member's own pill,
 * when they're someone else's relative, a darker one. The "+n" pill has no
 * disc.
 */
export function PersonPill({
  pill,
  size,
  person,
  self,
  label,
  onPress,
}: {
  pill: OrbitPill;
  size: PillSize;
  /** Null on the "+n" pill. */
  person: FamilyPerson | null;
  /** The signed-in member's own entry. */
  self: boolean;
  /** What VoiceOver says: "Mother, Amina Jaffer". */
  label: string;
  onPress: () => void;
}) {
  const palette = usePalette();
  const deceased = !!person && (!!person.is_deceased || !!person.date_of_death);
  const first = person
    ? (person.preferred_name || person.first_name || person.last_name || "").trim()
    : "";
  const { width, height } = size;
  const disc = height - 7;
  // The web's pill text is 13 points in a 36-point pill.
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
          backgroundColor: palette.pill,
          borderColor: self ? palette.foreground : palette.pillBorder,
          borderStyle: deceased ? "dashed" : "solid",
          opacity: pressed ? 0.6 : 1,
        },
        person ? null : styles.more,
      ]}
    >
      {person ? (
        <>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={[
              styles.name,
              {
                fontSize: text,
                color: deceased ? palette.mutedForeground : palette.foreground,
              },
            ]}
          >
            {first || "—"}
          </Text>
          <View
            style={[
              styles.disc,
              {
                width: disc,
                height: disc,
                borderRadius: disc / 2,
                backgroundColor: palette.pillInk,
                opacity: deceased ? 0.7 : 1,
              },
            ]}
          >
            {/* In the pill's own gray: the letters are where the disc isn't. */}
            <Text
              numberOfLines={1}
              style={[styles.initials, { fontSize: disc * 0.42, color: palette.pill }]}
            >
              {personInitials(person)}
            </Text>
          </View>
        </>
      ) : (
        <Text style={[styles.name, styles.moreText, { fontSize: text, color: palette.mutedForeground }]}>
          +{pill.more}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingLeft: 10,
    paddingRight: 2,
    gap: 3,
  },
  more: { justifyContent: "center", paddingLeft: 0, paddingRight: 0 },
  name: { flex: 1, fontFamily: font.medium },
  moreText: { flex: 0, textAlign: "center" },
  disc: { alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: font.semibold, letterSpacing: 0.2 },
});
