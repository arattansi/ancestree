import * as React from "react";
import {
  type GestureResponderEvent,
  PanResponder,
  type PanResponderInstance,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import {
  boxChars,
  inkPoint,
  INK_ASPECT,
  INK_BOX_MAX_CHARS,
  INK_MAX_STROKES,
  inkUpTo,
  replayTimeline,
  strokePath,
  worthAdding,
  type InkBox,
  type InkStroke,
} from "@/lib/card-ink";
import { font, usePalette } from "@/theme";

const PROMPT: Record<InkBox, string> = { draw: "draw here", sign: "sign here" };

/**
 * A box to draw or sign in with a finger (Step 217.4), the web's ink on
 * the phone: React Native's own touches (`PanResponder`) and
 * `react-native-svg`, no new gesture library. Each stroke is handed up
 * once the finger lifts; undo takes the last off, clear all of them.
 * `onDrawing` says when a finger is down, so the screen can stop
 * scrolling under it.
 */
export function InkPad({
  box,
  value,
  onChange,
  onDrawing,
  disabled,
  label,
}: {
  box: InkBox;
  value: InkStroke[] | null;
  onChange: (strokes: InkStroke[] | null) => void;
  onDrawing?: (drawing: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  const palette = usePalette();
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);
  const [live, setLive] = React.useState<InkStroke | null>(null);
  const [full, setFull] = React.useState(false);
  const strokes = value ?? [];
  const empty = strokes.length === 0;

  // The touches live outside render: the responder is made once, and told
  // what the pad holds now after each render.
  const [touches] = React.useState(() => new InkTouches(box));
  React.useEffect(() => {
    touches.sync({
      strokes: value ?? [],
      size,
      disabled: !!disabled,
      onChange,
      onDrawing,
      show: setLive,
      full: setFull,
    });
  }, [touches, value, size, disabled, onChange, onDrawing]);

  return (
    <View style={styles.pad}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize((s) => (s && s.width === width && s.height === height ? s : { width, height }));
        }}
        style={[
          styles.box,
          {
            aspectRatio: INK_ASPECT[box],
            borderColor: palette.kraftLine,
            backgroundColor: palette.cakeSponge,
            opacity: disabled ? 0.6 : 1,
          },
          box === "draw" && styles.square,
        ]}
        {...touches.responder.panHandlers}
      >
        {box === "sign" ? (
          <View pointerEvents="none" style={[styles.line, { borderColor: palette.kraftLine }]} />
        ) : null}
        {empty && !live ? (
          <View pointerEvents="none" style={styles.prompt}>
            <Text style={[styles.promptText, { color: palette.mutedForeground }]}>{PROMPT[box]}</Text>
          </View>
        ) : null}
        {size ? (
          <Svg pointerEvents="none" width={size.width} height={size.height} style={StyleSheet.absoluteFill}>
            {strokes.map((s, i) => (
              <Path key={i} d={strokePath(s, box, size.width, size.height)} fill={palette.foreground} />
            ))}
            {live ? (
              <Path d={strokePath(live, box, size.width, size.height, false)} fill={palette.foreground} />
            ) : null}
          </Svg>
        ) : null}
      </View>
      <View style={styles.tools}>
        <Tool
          label="undo"
          disabled={disabled || empty}
          onPress={() => {
            setFull(false);
            onChange(strokes.length > 1 ? strokes.slice(0, -1) : null);
          }}
        />
        <Tool
          label="clear"
          disabled={disabled || empty}
          onPress={() => {
            setFull(false);
            onChange(null);
          }}
        />
        {full ? (
          <Text style={[styles.full, { color: palette.mutedForeground }]}>that’s as much as fits.</Text>
        ) : null}
      </View>
    </View>
  );
}

type PadNow = {
  strokes: InkStroke[];
  size: { width: number; height: number } | null;
  disabled: boolean;
  onChange: (strokes: InkStroke[] | null) => void;
  onDrawing?: (drawing: boolean) => void;
  /** The stroke under the finger, drawn as it goes. */
  show: (stroke: InkStroke | null) => void;
  /** No more fits in the box. */
  full: (full: boolean) => void;
};

/**
 * A pad's touches (React Native's `PanResponder`): a stroke from a finger
 * down to its lifting, each point where it was in the box, how hard it
 * pressed (where the phone can tell) and when.
 */
class InkTouches {
  readonly responder: PanResponderInstance;
  private now: PadNow | null = null;
  private stroke: InkStroke | null = null;
  // When the box's first touch was, so each point says when it was drawn.
  private origin: number | null = null;

  constructor(private readonly box: InkBox) {
    this.responder = PanResponder.create({
      onStartShouldSetPanResponder: () => !!this.now && !this.now.disabled,
      onMoveShouldSetPanResponder: () => !!this.now && !this.now.disabled,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => this.begin(e),
      onPanResponderMove: (e) => {
        if (!this.stroke) return;
        this.add(e);
        this.now?.show([...this.stroke]);
      },
      onPanResponderRelease: () => this.end(),
      onPanResponderTerminate: () => this.end(),
    });
  }

  sync(now: PadNow) {
    this.now = now;
    if (now.strokes.length === 0 && !this.stroke) this.origin = null;
  }

  private begin(e: GestureResponderEvent) {
    const now = this.now;
    if (!now) return;
    if (now.strokes.length >= INK_MAX_STROKES) {
      now.full(true);
      return;
    }
    if (this.origin === null) {
      // Kept ink carries on after its last point.
      const last = now.strokes.at(-1)?.at(-1)?.[3];
      this.origin = e.nativeEvent.timestamp - (last === undefined ? 0 : last + 300);
    }
    this.stroke = [];
    now.onDrawing?.(true);
    this.add(e);
    now.show([...this.stroke]);
  }

  private add(e: GestureResponderEvent) {
    const stroke = this.stroke;
    const frame = this.now?.size;
    if (!stroke || !frame) return;
    const { locationX, locationY, force, timestamp } = e.nativeEvent;
    const point = inkPoint(
      locationX,
      locationY,
      frame.width,
      frame.height,
      force ?? 0,
      timestamp - (this.origin ?? timestamp),
    );
    if (worthAdding(stroke, point, this.box)) stroke.push(point);
  }

  private end() {
    const stroke = this.stroke;
    const now = this.now;
    this.stroke = null;
    if (!now) return;
    now.show(null);
    now.onDrawing?.(false);
    if (!stroke || stroke.length === 0) return;
    const next = [...now.strokes, stroke];
    if (boxChars(next) > INK_BOX_MAX_CHARS) {
      now.full(true);
      return;
    }
    now.onChange(next);
  }
}

function Tool({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.tool, (pressed || disabled) && { opacity: disabled ? 0.4 : 0.6 }]}
    >
      <Text style={[styles.toolText, { color: palette.foreground }]}>{label}</Text>
    </Pressable>
  );
}

/** How long a box's ink takes to write out again, for the box after it to wait. */
export function replayLength(strokes: readonly InkStroke[] | null | undefined): number {
  return strokes ? replayTimeline(strokes).duration : 0;
}

/**
 * Ink on a card, the phone's `InkDrawing` (Step 217.4): a drawing or a
 * name signed by hand, `width` points across, in the text's colour.
 * `replay` writes it out again as it was drawn, `delay` ms in, unless the
 * phone asks for less motion.
 */
export function InkDrawing({
  box,
  strokes,
  width,
  label,
  replay = false,
  delay = 0,
}: {
  box: InkBox;
  strokes: readonly InkStroke[];
  width: number;
  label: string;
  replay?: boolean;
  delay?: number;
}) {
  const palette = usePalette();
  const reduced = useReducedMotion();
  const height = width / INK_ASPECT[box];
  const timeline = React.useMemo(() => replayTimeline(strokes), [strokes]);
  const playing = replay && !reduced && timeline.duration > 0;
  const [at, setAt] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let start: number | null = null;
    const step = (t: number) => {
      start ??= t + delay;
      const ms = t - start;
      setAt(ms);
      if (ms < timeline.duration) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, delay, timeline]);

  const ms = playing ? (at ?? -1) : Infinity;
  const done = ms >= timeline.duration;
  const shown = done ? timeline.strokes : inkUpTo(timeline.strokes, ms);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width, height }}>
      <Svg width={width} height={height}>
        {shown.map((s, i) => {
          const writing = !done && i === shown.length - 1 && s.length < timeline.strokes[i].length;
          return <Path key={i} d={strokePath(s, box, width, height, !writing)} fill={palette.foreground} />;
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { gap: 6 },
  box: {
    width: "100%",
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 10,
    overflow: "hidden",
  },
  square: { maxWidth: 320 },
  line: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: "22%",
    borderBottomWidth: 1,
  },
  prompt: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  promptText: { fontFamily: font.regular, fontSize: 15 },
  tools: { flexDirection: "row", alignItems: "center", gap: 18, paddingHorizontal: 4 },
  tool: { paddingVertical: 4 },
  toolText: { fontFamily: font.medium, fontSize: 15 },
  full: { fontFamily: font.regular, fontSize: 13 },
});
