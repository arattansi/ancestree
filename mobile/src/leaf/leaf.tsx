import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { ClipPath, Defs, G, Path } from "react-native-svg";

import {
  BLADE_OVERHANG,
  inside,
  leafGeometry,
  MIDRIB,
  polygons,
  type LeafShape,
} from "@/lib/leaf-shapes";
import type { OrbitSide } from "@/lib/leaf-orbit";
import { font, usePalette } from "@/theme";

/** The blade box every leaf is drawn in (`lib/leaf-shapes.ts`). */
export const BOX_W = 208;
export const BOX_H = 150;

/** Where the text stops short of the tip, in box units, as on the web card. */
const TEXT_RIGHT = 32;

/** The outline's width; half of it lies outside the outline. */
const STROKE = 4;

/**
 * How far the drawing runs past the box, in box units: a maple's lobes stand
 * above it and hang below it, and the outline and the stem's round end reach
 * half a stroke further all round (ten tips end on the box's right side). An
 * SVG on the phone draws nothing outside its own view, so the view takes this
 * much more room, as the web's `overflow-visible` does (Step 150).
 */
const BLEED_X = STROKE / 2;
const BLEED_Y = BLADE_OVERHANG + STROKE / 2;

type XY = { x: number; y: number };

const anchors = new Map<LeafShape, Record<OrbitSide, XY>>();

/**
 * Where each group's lines leave a leaf, in box units: parents' from the
 * top of the blade at its middle (where the web's descent lines land),
 * children's from under it, spouses' from the end of the stem, siblings'
 * from the tip.
 */
export function leafAnchors(shape: LeafShape): Record<OrbitSide, XY> {
  const known = anchors.get(shape);
  if (known) return known;
  const geometry = leafGeometry(shape);
  const polys = polygons(geometry.blade);
  let tip = BOX_W / 2;
  for (let x = BOX_W; x > BOX_W / 2; x -= 1) {
    if (inside(polys, { x, y: MIDRIB })) {
      tip = x;
      break;
    }
  }
  const found = {
    parents: { x: BOX_W / 2, y: geometry.top },
    children: { x: BOX_W / 2, y: geometry.bottom },
    spouses: { x: 0, y: MIDRIB },
    siblings: { x: tip, y: MIDRIB },
  };
  anchors.set(shape, found);
  return found;
}

/**
 * One person as their leaf, the species of where they were born (Steps 27,
 * 96): the web's leaf card drawn large, stem in from the left, tip to the
 * right, the name on the blade. `width` is in points; the leaf keeps the
 * box's proportions.
 *
 * The web fits text by measuring it in the browser; here iOS does it,
 * shrinking the name to fit its line (`adjustsFontSizeToFit`).
 *
 * The view is the box; the drawing hangs out of it by `BLEED_X` and
 * `BLEED_Y`, so the anchors and the text keep the box's units.
 */
export function Leaf({
  shape,
  width,
  name,
  lines,
  deceased,
  clipId,
}: {
  shape: LeafShape;
  width: number;
  name: string;
  /** Up to two lines under the name: "née …", the years. */
  lines: string[];
  deceased: boolean;
  /** Unique per leaf on screen. */
  clipId: string;
}) {
  const palette = usePalette();
  const geometry = leafGeometry(shape);
  const scale = width / BOX_W;
  const height = BOX_H * scale;
  const textLeft = geometry.textLeft * scale;
  const textWidth = (BOX_W - TEXT_RIGHT) * scale - textLeft;

  return (
    <View style={{ width, height }}>
      <Svg
        width={(BOX_W + 2 * BLEED_X) * scale}
        height={(BOX_H + 2 * BLEED_Y) * scale}
        viewBox={`${-BLEED_X} ${-BLEED_Y} ${BOX_W + 2 * BLEED_X} ${BOX_H + 2 * BLEED_Y}`}
        style={{ position: "absolute", left: -BLEED_X * scale, top: -BLEED_Y * scale }}
      >
        <Defs>
          <ClipPath id={clipId}>
            <Path d={geometry.blade} />
          </ClipPath>
        </Defs>
        {/* The stem, out to the left. */}
        <Path
          d={`M0,${MIDRIB} L46,${MIDRIB}`}
          stroke={palette.brown}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
        />
        {/* Outline under the fills, so only the silhouette's edge shows. */}
        <Path
          d={geometry.blade}
          fill="none"
          stroke={palette.green}
          strokeWidth={STROKE}
          strokeDasharray={deceased ? "6 5" : undefined}
          strokeLinejoin="round"
        />
        <Path d={geometry.blade} fill={palette.card} />
        <Path d={geometry.blade} fill={palette.green} fillOpacity={0.2} />
        <G clipPath={`url(#${clipId})`} opacity={geometry.veinOpacity}>
          {geometry.veins.map((d) => (
            <Path
              key={d}
              d={d}
              stroke={palette.brown}
              strokeWidth={1}
              strokeLinecap="round"
              fill="none"
            />
          ))}
        </G>
      </Svg>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            left: textLeft,
            width: textWidth,
            justifyContent: "center",
          },
        ]}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          style={[
            styles.name,
            {
              fontSize: 17 * scale,
              color: deceased ? palette.mutedForeground : palette.foreground,
            },
          ]}
        >
          {name}
        </Text>
        {lines.map((line) => (
          <Text
            key={line}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={[
              styles.line,
              { fontSize: 13 * scale, color: palette.mutedForeground },
            ]}
          >
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: font.semibold },
  line: { fontFamily: font.regular, marginTop: 2 },
});
