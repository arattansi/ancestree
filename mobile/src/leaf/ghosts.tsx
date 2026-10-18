import * as React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, {
  Defs,
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
 *
 * The blur is drawn, not filtered (Step 186): each shape a few times, each
 * a little larger and fainter, so its edge fades as a Gaussian blur's does.
 * A blur filter was drawn off screen every time a leaf view came in, and
 * took long enough that a walk's slide was over before it was seen.
 */
export function Ghosts({
  ghosts,
  width,
  height,
  children,
}: {
  ghosts: GhostLayout;
  width: number;
  height: number;
  /** Drawn over them on the same canvas: the leaf's own lines (Step 186). */
  children?: React.ReactNode;
}) {
  const palette = usePalette();
  const depths = [...new Set(ghosts.ghosts.map((g) => g.depth))];
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
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
        <G key={depth} opacity={OPACITY[depth - 1] ?? OPACITY[OPACITY.length - 1]}>
          {ghosts.ghosts
            .filter((g) => g.depth === depth)
            .map((g) => (
              <GhostPill
                key={g.id}
                x={g.x}
                y={g.y}
                size={ghosts.sizes[depth - 1]}
                blur={BLUR[depth - 1] ?? BLUR[BLUR.length - 1]}
              />
            ))}
        </G>
      ))}
      {children}
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
function GhostPill({
  x,
  y,
  size,
  blur,
}: {
  x: number;
  y: number;
  size: PillSize;
  /** The blur's standard deviation, in points. */
  blur: number;
}) {
  const palette = usePalette();
  const { width: w, height: h } = size;
  const left = x - w / 2;
  const disc = h - 6;
  const smudge = h * 0.22;
  return (
    <>
      <Soft
        x={left}
        y={y - h / 2}
        width={w}
        height={h}
        radius={h / 2}
        fill={palette.pill}
        blur={blur}
      />
      <Soft
        x={left + h * 0.4}
        y={y - smudge / 2}
        width={w * 0.36}
        height={smudge}
        radius={smudge / 2}
        fill={palette.mutedForeground}
        blur={blur}
      />
      <Soft
        x={left + w - 3 - disc}
        y={y - disc / 2}
        width={disc}
        height={disc}
        radius={disc / 2}
        fill={palette.pillInk}
        blur={blur}
      />
    </>
  );
}

/**
 * A rounded rectangle blurred by hand: drawn once per layer of `FEATHER`,
 * grown (or shrunk) by `grow` blurs and faded to `alpha`, largest and
 * faintest first. The alphas are set so that, stacked, each band between
 * two layers is as covered as a Gaussian blur leaves it that far from the
 * edge: a sixteenth a blur and a half outside, half on the edge, all of it
 * two blurs in.
 */
function Soft({
  x,
  y,
  width,
  height,
  radius,
  fill,
  blur,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  fill: string;
  blur: number;
}) {
  return (
    <>
      {FEATHER.map(({ grow, alpha }) => {
        const d = grow * blur;
        const rw = width + 2 * d;
        const rh = height + 2 * d;
        if (rw <= 0 || rh <= 0) return null;
        return (
          <Rect
            key={grow}
            x={x - d}
            y={y - d}
            width={rw}
            height={rh}
            rx={Math.max(0, Math.min(radius + d, rh / 2, rw / 2))}
            fill={fill}
            fillOpacity={alpha}
          />
        );
      })}
    </>
  );
}

const FEATHER = [
  { grow: 1.75, alpha: 0.067 },
  { grow: 1.25, alpha: 0.098 },
  { grow: 0.75, alpha: 0.178 },
  { grow: 0.25, alpha: 0.277 },
  { grow: -0.25, alpha: 0.383 },
  { grow: -0.75, alpha: 0.486 },
  { grow: -1.25, alpha: 0.579 },
  { grow: -1.75, alpha: 1.000 },
];

/** By generation out: how blurred and how faded. */
const BLUR = [1.4, 1.9];
const OPACITY = [0.55, 0.3];
const lineOpacity = (depth: number) => (depth <= 1 ? 0.4 : depth === 2 ? 0.25 : 0.18);
const LINE = 1.5;
const CORNER = 6;
