import * as React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  FeGaussianBlur,
  Filter,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

import { roundedPolyline } from "@/lib/edge-geometry";
import type { GhostLayout } from "@/lib/leaf-ghosts";
import type { PillSize } from "@/lib/leaf-orbit";
import { usePalette } from "@/theme";

/**
 * The family past the pills (Step 184, `lib/leaf-ghosts.ts`), out of focus:
 * smaller pills with no name to read, blurred and faded, fainter each
 * generation out, as the web blurs the people a visitor may not see
 * (`opacity-30 blur-[2px]`). Their lines are the spotlight's brown, faint;
 * past the last generation a short line fades out where the tree goes on.
 */
export function Ghosts({
  ghosts,
  width,
  height,
}: {
  ghosts: GhostLayout;
  width: number;
  height: number;
}) {
  const palette = usePalette();
  const depths = [...new Set(ghosts.ghosts.map((g) => g.depth))];
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        {depths.map((depth) => (
          // The whole frame, so the blur isn't cut off at a row's edges.
          <Filter
            key={depth}
            id={`ghost-blur-${depth}`}
            filterUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={width}
            height={height}
          >
            <FeGaussianBlur stdDeviation={BLUR[depth - 1] ?? BLUR[BLUR.length - 1]} />
          </Filter>
        ))}
        {ghosts.stubs.map((s, i) => (
          <LinearGradient
            key={i}
            id={`ghost-stub-${i}`}
            gradientUnits="userSpaceOnUse"
            x1={s.from.x}
            y1={s.from.y}
            x2={s.to.x}
            y2={s.to.y}
          >
            <Stop offset={0} stopColor={palette.brown} stopOpacity={lineOpacity(s.depth)} />
            <Stop offset={1} stopColor={palette.brown} stopOpacity={0} />
          </LinearGradient>
        ))}
      </Defs>

      {ghosts.lines.map((line, i) => (
        <Path
          key={i}
          d={roundedPolyline(line.points, CORNER)}
          stroke={palette.brown}
          strokeOpacity={lineOpacity(line.depth)}
          strokeWidth={LINE}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
      {ghosts.stubs.map((s, i) => (
        <Line
          key={i}
          x1={s.from.x}
          y1={s.from.y}
          x2={s.to.x}
          y2={s.to.y}
          stroke={`url(#ghost-stub-${i})`}
          strokeWidth={LINE}
          strokeLinecap="round"
        />
      ))}

      {depths.map((depth) => (
        <G
          key={depth}
          filter={`url(#ghost-blur-${depth})`}
          opacity={OPACITY[depth - 1] ?? OPACITY[OPACITY.length - 1]}
        >
          {ghosts.ghosts
            .filter((g) => g.depth === depth)
            .map((g) => (
              <GhostPill key={g.id} x={g.x} y={g.y} size={ghosts.sizes[depth - 1]} />
            ))}
        </G>
      ))}
    </Svg>
  );
}

/**
 * Taps on the ghosts: each walks to the pill it's reached through, where
 * the ghosts come into focus. VoiceOver skips them; the pills say who's there.
 */
export function GhostTargets({
  ghosts,
  onWalk,
}: {
  ghosts: GhostLayout;
  onWalk: (id: string) => void;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {ghosts.ghosts.map((g) => {
        const { width, height } = ghosts.sizes[g.depth - 1];
        return (
          <Pressable
            key={g.id}
            accessible={false}
            importantForAccessibility="no"
            onPress={() => onWalk(g.via)}
            style={{
              position: "absolute",
              left: g.x - width / 2,
              top: g.y - height / 2,
              width,
              height,
            }}
          />
        );
      })}
    </View>
  );
}

/** A pill out of focus: its shape, a smudge for the name, the dark disc. */
function GhostPill({ x, y, size }: { x: number; y: number; size: PillSize }) {
  const palette = usePalette();
  const { width: w, height: h } = size;
  const left = x - w / 2;
  const disc = h - 6;
  return (
    <>
      <Rect
        x={left}
        y={y - h / 2}
        width={w}
        height={h}
        rx={h / 2}
        fill={palette.pill}
        stroke={palette.pillBorder}
        strokeWidth={1}
      />
      <Rect
        x={left + h * 0.4}
        y={y - h * 0.11}
        width={w * 0.36}
        height={h * 0.22}
        rx={h * 0.11}
        fill={palette.mutedForeground}
      />
      <Circle cx={left + w - 3 - disc / 2} cy={y} r={disc / 2} fill={palette.pillInk} />
    </>
  );
}

/** By generation out: how blurred and how faded. */
const BLUR = [1.4, 1.9];
const OPACITY = [0.55, 0.3];
const lineOpacity = (depth: number) => (depth <= 1 ? 0.4 : depth === 2 ? 0.25 : 0.18);
const LINE = 1.5;
const CORNER = 6;
