import * as React from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { ClipPath, Defs, G, Path, Rect } from "react-native-svg";

import { CANDLE, CANDLE_HEIGHT, leafCandles } from "@/lib/candles";
import type { LeafShape } from "@/lib/leaf-shapes";
import { usePalette } from "@/theme";

/** The stripes each candle in turn wears, as on the web: red, then green. */
const STRIPES = ["#e8452c", "#77b255"];
const CREAM = "#fbf8f1";

/** The web's flame (`components/tree/birthday-candles.tsx`), in its own box. */
const FLAME = "M3.5 0C4.6 2.6 7 4.6 7 6.6A3.5 3.4 0 0 1 0 6.6C0 4.6 2.4 2.6 3.5 0Z";
const CORE = "M3.5 3.6C4.1 5 5.1 6 5.1 7.1A1.6 1.6 0 0 1 1.9 7.1C1.9 6 2.9 5 3.5 3.6Z";

/**
 * Birthday candles stuck into the top of a leaf (Step 205), where the web
 * puts them (`leafCandles`), drawn at the leaf's `scale`. Each flame sways a
 * little about its foot, a beat after the one before, unless the phone asks
 * for less motion.
 */
export function LeafCandles({ shape, scale }: { shape: LeafShape; scale: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {leafCandles(shape).map((foot, i) => (
        <Candle key={foot.x} x={foot.x} y={foot.y} scale={scale} index={i} />
      ))}
    </View>
  );
}

function Candle({
  x,
  y,
  scale,
  index,
}: {
  x: number;
  y: number;
  scale: number;
  index: number;
}) {
  const palette = usePalette();
  const { width, stick, wick, flameWidth, flameHeight } = CANDLE;
  const reduced = useReducedMotion();
  const sway = useSharedValue(0);
  React.useEffect(() => {
    if (reduced) return;
    sway.value = withDelay(
      index * 280,
      withRepeat(
        withTiming(1, { duration: 800 + index * 120, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(sway);
  }, [reduced, index, sway]);
  const flame = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${-3 + 6 * sway.value}deg` },
      { scaleX: 1.04 - 0.1 * sway.value },
      { scaleY: 0.95 + 0.12 * sway.value },
    ],
  }));

  // The candle's box, its flame's width across, from the flame's tip to
  // its foot; the stick is centred in it.
  const left = flameWidth / 2 - width / 2;
  const clipId = `candle-${index}`;
  return (
    <View
      style={{
        position: "absolute",
        left: (x - flameWidth / 2) * scale,
        top: (y - CANDLE_HEIGHT) * scale,
        width: flameWidth * scale,
        height: CANDLE_HEIGHT * scale,
      }}
    >
      <Svg
        width={flameWidth * scale}
        height={CANDLE_HEIGHT * scale}
        viewBox={`0 0 ${flameWidth} ${CANDLE_HEIGHT}`}
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <ClipPath id={clipId}>
            <Rect x={left} y={flameHeight + wick} width={width} height={stick} rx={1.5} />
          </ClipPath>
        </Defs>
        <Rect
          x={left}
          y={flameHeight + wick}
          width={width}
          height={stick}
          rx={1.5}
          fill={CREAM}
        />
        <G clipPath={`url(#${clipId})`}>
          {Array.from({ length: 6 }, (_, k) => {
            const top = flameHeight + wick + k * 4.5 - 4;
            return (
              <Path
                key={k}
                d={`M${left - 1} ${top + 3.5}L${left + width + 1} ${top}L${left + width + 1} ${top + 2}L${left - 1} ${top + 5.5}Z`}
                fill={STRIPES[index % STRIPES.length]}
              />
            );
          })}
        </G>
        <Rect
          x={flameWidth / 2 - 0.5}
          y={flameHeight - 1}
          width={1}
          height={wick + 1.5}
          fill={palette.foreground}
          opacity={0.7}
        />
      </Svg>
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            // A unit down, over the wick's tip, as the web's.
            top: scale,
            width: flameWidth * scale,
            height: flameHeight * scale,
            transformOrigin: "50% 100%",
          },
          flame,
        ]}
      >
        <Svg
          width={flameWidth * scale}
          height={flameHeight * scale}
          viewBox={`0 0 ${flameWidth} ${flameHeight}`}
        >
          <Path d={FLAME} fill="#f7a531" />
          <Path d={CORE} fill="#ffe8a3" />
        </Svg>
      </Animated.View>
    </View>
  );
}
