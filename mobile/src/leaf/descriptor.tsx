import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { leafGeometry, MIDRIB, polygons, type LeafShape } from "@/lib/leaf-shapes";
import { nativeLeaf } from "@/lib/native-leaf";
import type { FamilyPerson } from "@/family/load";
import { font, usePalette } from "@/theme";

/** The pill's height, and the gap under it to the menu bar. */
const HEIGHT = 28;
const GAP = 10;
/** How much of the leaf view's foot the pill keeps clear of the family. */
export const DESCRIPTOR_ROOM = HEIGHT + GAP;

/** The little leaf's width; its height follows the blade's. */
const GLYPH_W = 22;

/**
 * What the leaf on screen is (Step 199): its tree and where that grows,
 * "Baobab · Tanzania" (`leafLabel`'s words), in a small gray pill just above
 * the menu bar with the leaf itself in miniature. As the web's leaf card
 * does, it always says something: a birthplace with no tree on record, or
 * none, is said so rather than left blank. A walk fades one pill into the
 * next. The leaf's own label reads it out; this is for the eye.
 */
export function LeafDescriptor({ person }: { person: FamilyPerson | undefined }) {
  const palette = usePalette();
  if (!person) return null;
  const leaf = nativeLeaf(person);
  const birthplace = !!(person.city_of_birth || person.country_of_birth);
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={styles.row}
    >
      <Animated.View
        key={person.id}
        entering={FadeIn.duration(240)}
        exiting={FadeOut.duration(160)}
        style={[styles.pill, { backgroundColor: palette.pill, borderColor: palette.pillBorder }]}
      >
        <Glyph shape={leaf.shape} faint={!leaf.species} />
        <Text numberOfLines={1} style={[styles.text, { color: palette.mutedForeground }]}>
          {leaf.species && leaf.region ? (
            <>
              <Text style={[styles.species, { color: palette.foreground }]}>
                {leaf.species}
              </Text>
              {` · ${leaf.region}`}
            </>
          ) : birthplace ? (
            "No native tree on record for this place"
          ) : (
            "Birthplace not recorded"
          )}
        </Text>
      </Animated.View>
    </View>
  );
}

const bounds = new Map<LeafShape, { x: number; y: number; width: number; height: number }>();

/** The blade's own box, from the stem's end (box units). */
function bladeBounds(shape: LeafShape) {
  const known = bounds.get(shape);
  if (known) return known;
  const points = polygons(leafGeometry(shape).blade).flat();
  const ys = points.map((p) => p.y);
  const right = Math.max(...points.map((p) => p.x));
  const top = Math.min(...ys);
  const found = { x: 0, y: top, width: right, height: Math.max(...ys) - top };
  bounds.set(shape, found);
  return found;
}

/** The leaf in miniature, stem in from the left as on the leaf view. */
function Glyph({ shape, faint }: { shape: LeafShape; faint: boolean }) {
  const palette = usePalette();
  const box = bladeBounds(shape);
  const height = (GLYPH_W * box.height) / box.width;
  return (
    <Svg
      width={GLYPH_W}
      height={Math.min(height, HEIGHT - 8)}
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      opacity={faint ? 0.55 : 1}
    >
      <Path
        d={`M0,${MIDRIB} L46,${MIDRIB}`}
        stroke={palette.brown}
        strokeWidth={10}
        strokeLinecap="round"
      />
      <Path d={leafGeometry(shape).blade} fill={palette.green} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: GAP,
    height: HEIGHT,
    alignItems: "center",
  },
  pill: {
    height: HEIGHT,
    maxWidth: "100%",
    borderRadius: HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingLeft: 9,
    paddingRight: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  text: { flexShrink: 1, fontFamily: font.regular, fontSize: 13 },
  species: { fontFamily: font.medium },
});
