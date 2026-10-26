import * as Haptics from "expo-haptics";
import * as React from "react";
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { roundedPolyline } from "@/lib/edge-geometry";
import { nativeLeaf } from "@/lib/native-leaf";
import { maidenLine, personDisplayName, personInitials, personLifespan } from "@/lib/person-name";
import {
  clampOffset,
  fitMap,
  MAP_PILL_H,
  MAP_PILL_W,
  treeMap,
  type TreeMap as Map_,
} from "@/lib/tree-map";
import type { Family, FamilyPerson } from "@/family/load";
import { BOX_H, BOX_W, Leaf } from "@/leaf/leaf";
import { DOT, Grid, type SpotlightPlaces } from "@/leaf/spotlight";
import { font, usePalette } from "@/theme";

type XY = { x: number; y: number };
type Frame = { width: number; height: number };

/** How far the map may be pinched, in and out. */
const ZOOM = { min: 0.08, max: 1.2 };
/** A touch that moves this far is a drag, not a tap. */
const SLOP = 6;
/** The map's lines, in canvas units: the web's unlit lines are 1.5 at zoom 1. */
const LINE = 3;
const CORNER = 10;
/** The opening takes as long as a walk's slide (Step 186). */
const OPEN_MS = 560;
const CLAMP = Extrapolation.CLAMP;

/**
 * The whole of one tree on the phone (Step 206): everyone on it as a small
 * gray pill with their first name and initials, seated as the web's canvas
 * seats them (`lib/tree-map.ts`), over the dotted ground. Drag to move
 * about it, pinch to zoom; tap a pill to open their leaf view. The one whose
 * leaf was open is ringed in brown, the member's own pill edged dark, as on
 * the leaf view.
 *
 * Opened from a leaf view (`from`), it opens at that view's own scale: the
 * leaf softly shrinks into its pill where it stands, the relatives' pills
 * glide from their places round the leaf to where the tree seats them, and
 * the rest of the tree and its lines fade in round them. Opened from the
 * picker, the whole tree fades in, fitted to the screen.
 */
export function TreeMapView({
  family,
  treeId,
  focusId,
  from,
  onPick,
}: {
  family: Family;
  treeId: string;
  /** Whose leaf view was open: where the map opens, ringed. */
  focusId: string | null;
  /** Where that leaf view's leaf and pills were, to open out of. */
  from?: SpotlightPlaces | null;
  onPick: (id: string) => void;
}) {
  const palette = usePalette();
  const [screen, setScreen] = React.useState<Frame | null>(null);
  const map = React.useMemo(() => mapOf(family, treeId), [family, treeId]);

  return (
    <View
      style={styles.stage}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setScreen((f) =>
          f && f.width === width && f.height === height ? f : { width, height },
        );
      }}
    >
      {screen ? (
        <Canvas
          key={treeId}
          family={family}
          map={map}
          screen={screen}
          focusId={focusId}
          from={from ?? null}
          onPick={onPick}
        />
      ) : null}
      {screen && map.pills.length === 0 ? (
        <View style={styles.empty} pointerEvents="none">
          <Text style={[styles.emptyText, { color: palette.mutedForeground }]}>
            Nobody on this tree yet.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** One tree's people and lines, as `lib/tree-map.ts` lays them out. */
function mapOf(family: Family, treeId: string): Map_ {
  const tree = family.trees.get(treeId);
  const people = tree
    ? [...tree.people].flatMap((id) => {
        const p = family.people.get(id);
        return p
          ? [
              {
                id,
                pos_x: p.pos_x,
                pos_y: p.pos_y,
                pos_dx: p.pos_dx,
                pos_dy: p.pos_dy,
                date_of_birth: p.date_of_birth,
              },
            ]
          : [];
      })
    : [];
  return treeMap({
    people,
    lines: family.lines,
    anchorIds: tree?.anchors ?? [],
    selfId: family.selfId,
  });
}

/** How someone comes in: gliding from a leaf view's place, or fading. */
type Arrival = { dx: number; dy: number } | null;

/**
 * The map on a screen of a known size: a dragged, pinched view over the
 * canvas. The view's offset and zoom live on the UI thread (Reanimated);
 * the pan responder feeds them from each touch.
 */
function Canvas({
  family,
  map,
  screen,
  focusId,
  from,
  onPick,
}: {
  family: Family;
  map: Map_;
  screen: Frame;
  focusId: string | null;
  from: SpotlightPlaces | null;
  onPick: (id: string) => void;
}) {
  const palette = usePalette();
  const focus = focusId ? (map.pills.find((p) => p.id === focusId) ?? null) : null;
  // Out of a leaf view: the zoom at which a map pill is that view's pill,
  // placed so the leaf's pill sits where the leaf was. Otherwise the whole
  // tree, fitted.
  const opening = React.useMemo(() => {
    if (from && focus) {
      const zoom = from.pill.height / MAP_PILL_H;
      const centre = {
        x: from.leaf.x + from.leaf.width / 2,
        y: from.leaf.y + from.leaf.height / 2,
      };
      return { zoom, x: centre.x - focus.x * zoom, y: centre.y - focus.y * zoom };
    }
    return fitMap(map, screen, 24, ZOOM);
  }, [map, screen, from, focus]);

  const offset = useSharedValue<XY>({ x: opening.x, y: opening.y });
  const zoom = useSharedValue(opening.zoom);
  // The opening, 0 to 1, eased as a walk's slide is.
  const opened = useSharedValue(0);
  React.useEffect(() => {
    opened.set(
      withTiming(1, {
        duration: from ? OPEN_MS : 240,
        easing: from ? Easing.out(Easing.poly(5)) : Easing.linear,
      }),
    );
  }, [opened, from]);

  // Where each of the leaf view's pills glides from, in canvas units.
  const arrivals = React.useMemo(() => {
    const out = new Map<string, Arrival>();
    if (!from || !focus) return out;
    for (const pill of map.pills) {
      const was = from.pills.get(pill.id);
      if (!was) continue;
      out.set(pill.id, {
        dx: (was.x - (opening.x + pill.x * opening.zoom)) / opening.zoom,
        dy: (was.y - (opening.y + pill.y * opening.zoom)) / opening.zoom,
      });
    }
    return out;
  }, [from, focus, map, opening]);

  const responder = React.useMemo(
    () => mapResponder({ map, screen, offset, zoom }),
    // The map and screen are the only inputs; the shared values are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, screen],
  );

  const moving = useAnimatedStyle(() => ({
    opacity: from ? 1 : opened.value,
    transform: [
      { translateX: offset.value.x },
      { translateY: offset.value.y },
      { scale: zoom.value },
    ],
  }));
  // The ground slides with the map and keeps its dots a dot apart on
  // screen, whatever the zoom: it's the screen's ground, not the tree's.
  const ground = useAnimatedStyle(() => {
    const wrap = (v: number) => ((v % DOT) + DOT) % DOT;
    return {
      transform: [{ translateX: wrap(offset.value.x) }, { translateY: wrap(offset.value.y) }],
    };
  });
  // The lines come once the pills have nearly settled.
  const lines = useAnimatedStyle(() => ({
    opacity: from ? interpolate(opened.value, [0.45, 1], [0, 1], CLAMP) : 1,
  }));

  const w = map.bounds.maxX - map.bounds.minX;
  const h = map.bounds.maxY - map.bounds.minY;
  const pick = (id: string) => {
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    onPick(id);
  };
  const person = focusId ? family.people.get(focusId) : undefined;

  return (
    <View style={StyleSheet.absoluteFill} {...responder.panHandlers}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            left: -DOT,
            top: -DOT,
            width: screen.width + 2 * DOT,
            height: screen.height + 2 * DOT,
          },
          ground,
        ]}
      >
        <Grid width={screen.width + 2 * DOT} height={screen.height + 2 * DOT} />
      </Animated.View>
      {/* The canvas, its origin at the tree's (0, 0): everything on it is
          placed in canvas units, and the whole moved and scaled together. */}
      <Animated.View style={[styles.canvas, moving]}>
        <Animated.View style={lines} pointerEvents="none">
          <Svg
            width={Math.max(1, w)}
            height={Math.max(1, h)}
            viewBox={`${map.bounds.minX} ${map.bounds.minY} ${Math.max(1, w)} ${Math.max(1, h)}`}
            style={{ position: "absolute", left: map.bounds.minX, top: map.bounds.minY }}
          >
            {map.lines.map((line, i) => (
              <Path
                key={i}
                d={roundedPolyline(line.points, CORNER)}
                stroke={palette.brown}
                strokeOpacity={line.dashed ? 0.5 : 0.75}
                strokeWidth={LINE}
                strokeDasharray={line.dashed ? "4 8" : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
          </Svg>
        </Animated.View>
        {map.pills.map((pill) => {
          const relative = family.people.get(pill.id);
          if (!relative) return null;
          return (
            <MapPill
              key={pill.id}
              x={pill.x}
              y={pill.y}
              person={relative}
              self={pill.id === family.selfId}
              focused={pill.id === focusId}
              opened={opened}
              arrival={from ? (arrivals.get(pill.id) ?? null) : undefined}
              onPress={() => pick(pill.id)}
            />
          );
        })}
      </Animated.View>
      {from && focus && person ? (
        <ShrinkingLeaf person={person} from={from} opened={opened} />
      ) : null}
    </View>
  );
}

/**
 * The leaf the map opened out of, where it stood, softly shrinking to its
 * pill's size and fading as the pill under it comes (Step 206).
 */
function ShrinkingLeaf({
  person,
  from,
  opened,
}: {
  person: FamilyPerson;
  from: SpotlightPlaces;
  opened: SharedValue<number>;
}) {
  const leaf = nativeLeaf(person);
  const { x, y, width } = from.leaf;
  const height = (width * BOX_H) / BOX_W;
  const small = from.pill.height / height;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(opened.value, [0, 0.5], [1, 0], CLAMP),
    transform: [{ scale: small + (1 - small) * (1 - opened.value) }],
  }));
  const name = personDisplayName(person);
  const maiden = maidenLine(person);
  const years = personLifespan(person);
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", left: x, top: y }, style]}
    >
      <Leaf
        shape={leaf.shape}
        width={width}
        name={name}
        lines={[maiden, years].filter((l): l is string => !!l)}
        deceased={!!person.is_deceased || !!person.date_of_death}
        clipId={`map-leaf-${person.id}`}
      />
    </Animated.View>
  );
}

/**
 * The map's touches: one finger drags it, two pinch it about the point
 * between them, and a touch that doesn't move is left to the pill under it.
 * Each move is measured from where the gesture began (`from`); the view's
 * offset and zoom are written straight to the UI thread.
 */
function mapResponder({
  map,
  screen,
  offset,
  zoom,
}: {
  map: Map_;
  screen: Frame;
  offset: SharedValue<XY>;
  zoom: SharedValue<number>;
}) {
  let from: { offset: XY; zoom: number; mid: XY; span: number } | null = null;
  const touches = (e: GestureResponderEvent) =>
    e.nativeEvent.touches.map((t) => ({ x: t.pageX, y: t.pageY }));
  const pinch = (pts: XY[]) => {
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const span = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    return { mid, span };
  };
  return PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,
    // A tap stays with the pill under it; a move takes over.
    onMoveShouldSetPanResponder: (e, g) =>
      e.nativeEvent.touches.length >= 2 || Math.hypot(g.dx, g.dy) > SLOP,
    onMoveShouldSetPanResponderCapture: (e, g) =>
      e.nativeEvent.touches.length >= 2 || Math.hypot(g.dx, g.dy) > SLOP,
    onPanResponderGrant: (e) => {
      const pts = touches(e);
      const two = pts.length >= 2 ? pinch(pts) : { mid: pts[0] ?? { x: 0, y: 0 }, span: 0 };
      from = { offset: offset.get(), zoom: zoom.get(), ...two };
    },
    onPanResponderMove: (e, g) => {
      if (!from) return;
      const pts = touches(e);
      if (pts.length >= 2) {
        // A pinch: the point between the fingers stays under them.
        const { mid, span } = pinch(pts);
        if (from.span === 0) {
          from = { ...from, offset: offset.get(), mid, span };
          return;
        }
        const z = Math.min(ZOOM.max, Math.max(ZOOM.min, (from.zoom * span) / from.span));
        const k = z / from.zoom;
        offset.set(
          clampOffset(
            {
              x: mid.x - (from.mid.x - from.offset.x) * k,
              y: mid.y - (from.mid.y - from.offset.y) * k,
            },
            map,
            z,
            screen,
          ),
        );
        zoom.set(z);
        return;
      }
      if (from.span > 0) {
        // Back to one finger: carry on from here.
        from = { offset: offset.get(), zoom: zoom.get(), mid: pts[0], span: 0 };
        return;
      }
      offset.set(
        clampOffset(
          { x: from.offset.x + g.dx, y: from.offset.y + g.dy },
          map,
          zoom.get(),
          screen,
        ),
      );
    },
    onPanResponderRelease: () => {
      from = null;
    },
    onPanResponderTerminate: () => {
      from = null;
    },
    onPanResponderTerminationRequest: () => false,
  });
}

/**
 * Someone on the map: the leaf view's gray pill (`person-pill.tsx`), at the
 * canvas's size, scaled with the map. A hit slop makes a tiny pill tappable.
 * Opening out of a leaf view, one of its pills glides here from where it
 * was (`arrival`), the leaf's own pill comes up under the shrinking leaf,
 * and anyone else fades in once the pills are nearly settled.
 */
function MapPill({
  x,
  y,
  person,
  self,
  focused,
  opened,
  arrival,
  onPress,
}: {
  x: number;
  y: number;
  person: FamilyPerson;
  self: boolean;
  focused: boolean;
  opened: SharedValue<number>;
  /** Undefined when the map isn't opening out of a leaf view. */
  arrival: Arrival | undefined;
  onPress: () => void;
}) {
  const palette = usePalette();
  const deceased = !!person.is_deceased || !!person.date_of_death;
  const first = (person.preferred_name || person.first_name || person.last_name || "").trim();
  const disc = MAP_PILL_H - 10;
  const animated = arrival !== undefined;
  const glides = !!arrival;
  const dx = arrival?.dx ?? 0;
  const dy = arrival?.dy ?? 0;
  const style = useAnimatedStyle(() => {
    if (!animated) return { opacity: 1, transform: [] };
    const e = opened.value;
    const opacity = glides
      ? 1
      : focused
        ? interpolate(e, [0.1, 0.5], [0, 1], CLAMP)
        : interpolate(e, [0.35, 0.9], [0, 1], CLAMP);
    return {
      opacity,
      transform: [{ translateX: (1 - e) * dx }, { translateY: (1 - e) * dy }],
    };
  }, [animated, glides, focused, dx, dy]);
  return (
    <Animated.View
      style={[
        styles.pillBox,
        { left: x - MAP_PILL_W / 2, top: y - MAP_PILL_H / 2 },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={personDisplayName(person)}
        accessibilityHint="Opens their leaf"
        onPress={onPress}
        hitSlop={24}
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: palette.pill,
            borderColor: focused ? palette.brown : self ? palette.foreground : palette.pillBorder,
            borderWidth: focused ? 4 : self ? 2.5 : 1.5,
            borderStyle: deceased ? "dashed" : "solid",
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.name,
            { color: deceased ? palette.mutedForeground : palette.foreground },
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
          <Text numberOfLines={1} style={[styles.initials, { color: palette.pill }]}>
            {personInitials(person)}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, overflow: "hidden" },
  canvas: { position: "absolute", left: 0, top: 0, width: 1, height: 1, transformOrigin: [0, 0, 0] },
  pillBox: { position: "absolute", width: MAP_PILL_W, height: MAP_PILL_H },
  pill: {
    width: MAP_PILL_W,
    height: MAP_PILL_H,
    borderRadius: MAP_PILL_H / 2,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 15,
    paddingRight: 4,
    gap: 4,
  },
  name: { flex: 1, fontFamily: font.medium, fontSize: 19 },
  disc: { alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: font.semibold, fontSize: 16, letterSpacing: 0.3 },
  empty: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: { fontFamily: font.regular, fontSize: 16 },
});
