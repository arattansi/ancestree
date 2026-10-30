import * as React from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import { ENVELOPE, leafEnvelope } from "@/lib/candles";
import { leafGeometry, type LeafShape } from "@/lib/leaf-shapes";
import { font, usePalette } from "@/theme";

/**
 * A small kraft envelope tied with twine (Step 217.4): a birthday card is
 * going round for someone. The web's mark (`EnvelopeMark`), `width` points
 * across.
 */
export function EnvelopeMark({ width = ENVELOPE.width }: { width?: number }) {
  const palette = usePalette();
  return (
    <Svg width={width} height={(width * 28) / 40} viewBox="0 0 40 28">
      <Rect x={1} y={1} width={38} height={26} rx={2} fill={palette.kraft} stroke={palette.kraftLine} />
      <Path d="M1,2 L20,16 L39,2" fill="none" stroke={palette.kraftLine} />
      <Path d="M20,1 L20,27 M1,15 L39,15" stroke={palette.twine} strokeWidth={1.6} />
      <Path
        d="M20,15 C15,10 10,10 11,14 C12,17 17,17 20,15 C25,10 30,10 29,14 C28,17 23,17 20,15"
        fill="none"
        stroke={palette.twine}
        strokeWidth={1.4}
      />
    </Svg>
  );
}

/**
 * The envelope at a leaf's shoulder, where `leafEnvelope` puts it, drawn at
 * the leaf's `scale`: a card to sign, or the member's own, ready.
 */
export function LeafEnvelope({ shape, scale }: { shape: LeafShape; scale: number }) {
  const at = leafEnvelope(shape);
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: at.x * scale,
        top: at.y * scale,
        transform: [{ rotate: `${ENVELOPE.tilt}deg` }],
      }}
    >
      <EnvelopeMark width={ENVELOPE.width * scale} />
    </View>
  );
}

/** How far down, in points, the string's end must be pulled to come undone. */
const PULL = 90;

/** The envelope's own units, as the web's: 300 by 200. */
const W = 300;
const H = 200;

/**
 * The envelope a birthday card comes in, on the person's first look (Step
 * 217.4, the web's `CardEnvelope`): kraft tied both ways with twine, a bow,
 * a tag with their leaf and name. Pull the string's end down, or press
 * "untie the string": the twine comes off, the flap lifts, the card rises
 * out, and `onOpened` runs. Less motion asked for, it opens at once.
 */
export function CardEnvelope({
  firstName,
  leaf,
  count,
  width,
  onOpened,
}: {
  firstName: string;
  leaf: LeafShape;
  count: number;
  /** Points across. */
  width: number;
  onOpened: () => void;
}) {
  const palette = usePalette();
  const reduced = useReducedMotion();
  const k = width / W;
  const pull = useSharedValue(0);
  const untied = useSharedValue(0);
  const opened = useSharedValue(0);
  const [sealed, setSealed] = React.useState(true);

  const untie = React.useCallback(() => {
    if (!sealed) return;
    setSealed(false);
    if (reduced) {
      onOpened();
      return;
    }
    untied.set(withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }));
    opened.set(
      withSequence(
        withTiming(0, { duration: 750 }),
        withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.cubic) }, (finished) => {
          if (finished) scheduleOnRN(onOpened);
        }),
      ),
    );
  }, [sealed, reduced, untied, opened, onOpened]);

  const string = React.useMemo(() => stringResponder(pull, untie), [pull, untie]);

  const twine = useAnimatedStyle(() => ({
    opacity: 1 - untied.value,
    transform: [{ translateY: untied.value * 30 * k }],
  }));
  const bow = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pull.value * 0.45 - untied.value * 0.55 }],
    opacity: 1 - untied.value,
  }));
  const end = useAnimatedStyle(() => ({
    transform: [
      { translateX: pull.value * 12 * k },
      { translateY: pull.value * 40 * k + untied.value * 60 * k },
    ],
    opacity: 1 - untied.value,
  }));
  // The flap closes down over the front, then, past halfway, opens up behind the card.
  const flapShut = useAnimatedStyle(() => ({
    transform: [{ scaleY: Math.max(0, 1 - opened.value * 2) }],
  }));
  const flapOpen = useAnimatedStyle(() => ({
    transform: [{ scaleY: Math.max(0, opened.value * 2 - 1) }],
  }));
  const card = useAnimatedStyle(() => ({
    transform: [{ translateY: -interpolate(opened.value, [0.4, 1], [0, 120], "clamp") * k }],
  }));

  const blade = leafGeometry(leaf).blade;
  const tagName = firstName.length > 6 ? `${firstName.slice(0, 5)}…` : firstName;
  const box = { width, height: H * k };
  const flapBox = { width, height: 128 * k };

  return (
    <View style={styles.wrap}>
      <View style={[box, { marginTop: 120 * k }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.kraftLine, borderRadius: 6 * k }]} />
        {/* The flap, open, behind the card. */}
        <Animated.View style={[styles.openFlap, { width, height: 116 * k, top: -116 * k }, flapOpen]}>
          <Svg width={width} height={116 * k} viewBox="0 0 300 116">
            <Path d="M1,115 L299,115 L160,8 Q150,0 140,8 Z" fill={palette.kraftFlap} stroke={palette.kraftLine} />
          </Svg>
        </Animated.View>
        <Animated.View
          style={[
            styles.inner,
            {
              left: 16 * k,
              right: 16 * k,
              top: 10 * k,
              height: 176 * k,
              borderColor: palette.kraftLine,
              backgroundColor: palette.cakeSponge,
              paddingTop: 20 * k,
            },
            card,
          ]}
        >
          <Text style={[styles.for, { color: palette.foreground, fontSize: 16 * Math.max(1, k * 0.9) }]}>
            for {firstName}
          </Text>
          <Text style={[styles.count, { color: palette.mutedForeground }]}>
            {count === 1 ? "1 signature" : `${count} signatures`}
          </Text>
        </Animated.View>
        <Svg width={width} height={H * k} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
          <Path
            d="M0,44 L150,132 L300,44 L300,194 Q300,200 294,200 L6,200 Q0,200 0,194 Z"
            fill={palette.kraft}
            stroke={palette.kraftLine}
          />
          <Path d="M0,200 L128,120 M300,200 L172,120" fill="none" stroke={palette.kraftLine} strokeOpacity={0.6} />
        </Svg>
        <Animated.View style={[styles.flap, flapBox, flapShut]}>
          <Svg width={width} height={128 * k} viewBox="0 0 300 128">
            <Path d="M1,1 L299,1 L160,116 Q150,124 140,116 Z" fill={palette.kraftFlap} stroke={palette.kraftLine} />
          </Svg>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, twine]}>
          <Svg width={width} height={H * k} viewBox={`0 0 ${W} ${H}`}>
            <Path d="M150,0 L150,200 M0,112 L300,112" stroke={palette.twine} strokeWidth={3.2} strokeLinecap="round" />
            <Path d="M150,112 L128,146" stroke={palette.twine} strokeWidth={1.2} fill="none" />
            <G transform="translate(70,150) rotate(-12)">
              <Rect x={0} y={0} width={66} height={38} rx={4} fill={palette.cakeSponge} stroke={palette.kraftLine} />
              <Circle cx={58} cy={8} r={2.6} fill={palette.background} stroke={palette.kraftLine} />
              <G transform="translate(2,9) scale(0.14)">
                <Path d={blade} fill={palette.green} stroke="#2f6b3c" strokeWidth={6} />
              </G>
            </G>
            <Path
              d="M150,112 C144,126 136,140 126,152"
              stroke={palette.twine}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
          <Text
            style={[
              styles.tagName,
              {
                color: palette.foreground,
                left: 101 * k,
                top: 158 * k,
                fontSize: 11 * k,
                transform: [{ rotate: "-12deg" }],
              },
            ]}
          >
            {tagName}
          </Text>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { transformOrigin: `${150 * k}px ${112 * k}px` }, bow]}
        >
          <Svg width={width} height={H * k} viewBox={`0 0 ${W} ${H}`}>
            <Path
              d="M150,112 C134,96 112,92 110,104 C108,116 130,120 150,112 Z M150,112 C166,96 188,92 190,104 C192,116 170,120 150,112 Z"
              fill="none"
              stroke={palette.twine}
              strokeWidth={3.2}
              strokeLinejoin="round"
            />
            <Ellipse cx={150} cy={112} rx={5.5} ry={4.5} fill={palette.twine} />
          </Svg>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, end]}>
          <Svg width={width} height={H * k} viewBox={`0 0 ${W} ${H}`}>
            <Path
              d="M150,112 C158,128 168,142 178,154"
              stroke={palette.twine}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
            <Circle cx={178} cy={154} r={4.5} fill={palette.twine} />
          </Svg>
        </Animated.View>
        {sealed ? (
          <View
            accessible={false}
            style={[
              styles.grip,
              { left: (178 - 26) * k, top: (154 - 26) * k, width: 52 * k, height: 52 * k },
            ]}
            {...string.panHandlers}
          />
        ) : null}
      </View>
      <View style={styles.actions}>
        {/* Light, over the dark the card opens on, as the web's. */}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !sealed }}
          disabled={!sealed}
          onPress={untie}
          style={({ pressed }) => [styles.untie, (pressed || !sealed) && { opacity: sealed ? 0.8 : 0.6 }]}
        >
          <Text style={styles.untieText}>untie the string</Text>
        </Pressable>
        <Text style={styles.or}>or pull it</Text>
      </View>
    </View>
  );
}

/**
 * The string's end, pulled: down (and a little right, the way it hangs) far
 * enough, it comes undone; let go early, it springs back.
 */
function stringResponder(pull: SharedValue<number>, untie: () => void) {
  return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => {
      pull.set(Math.max(0, Math.min(1, (g.dx * 0.3 + g.dy * 0.95) / PULL)));
    },
    onPanResponderRelease: () => {
      if (pull.get() >= 0.6) untie();
      else pull.set(withTiming(0, { duration: 200 }));
    },
    onPanResponderTerminate: () => {
      pull.set(withTiming(0, { duration: 200 }));
    },
  });
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 24 },
  inner: {
    position: "absolute",
    alignItems: "center",
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 4,
  },
  for: { fontFamily: font.semibold },
  count: { fontFamily: font.regular, fontSize: 12 },
  flap: { position: "absolute", left: 0, top: 0, transformOrigin: "top" },
  openFlap: { position: "absolute", left: 0, transformOrigin: "bottom" },
  tagName: { position: "absolute", fontFamily: font.semibold },
  grip: { position: "absolute", borderRadius: 999 },
  actions: { alignItems: "center", gap: 6 },
  untie: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  untieText: { fontFamily: font.semibold, fontSize: 15, color: "#171717" },
  or: { fontFamily: font.regular, fontSize: 13, color: "rgba(255,255,255,0.75)" },
});
