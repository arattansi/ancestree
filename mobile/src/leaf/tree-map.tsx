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
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { roundedPolyline } from "@/lib/edge-geometry";
import { personDisplayName, personInitials } from "@/lib/person-name";
import {
  centreOn,
  clampOffset,
  fitMap,
  MAP_PILL_H,
  MAP_PILL_W,
  treeMap,
  type TreeMap as Map_,
} from "@/lib/tree-map";
import type { Family, FamilyPerson } from "@/family/load";
import { DOT, Grid } from "@/leaf/spotlight";
import { font, usePalette } from "@/theme";

type XY = { x: number; y: number };
type Frame = { width: number; height: number };

/** How far the map may be pinched, in and out. */
const ZOOM = { min: 0.08, max: 0.9 };
/** A touch that moves this far is a drag, not a tap. */
const SLOP = 6;
/** The map's lines, in canvas units: the web's unlit lines are 1.5 at zoom 1. */
const LINE = 3;
const CORNER = 10;

/**
 * The whole of one tree on the phone (Step 206): everyone on it as a small
 * gray pill with their first name and initials, seated as the web's canvas
 * seats them (`lib/tree-map.ts`), over the dotted ground, at the zoom that
 * shows the whole tree. Drag to move about it, pinch to zoom; tap a pill to
 * open their leaf view. The one whose leaf was open is ringed in brown, the
 * member's own pill edged dark, as on the leaf view.
 */
export function TreeMapView({
  family,
  treeId,
  focusId,
  onPick,
}: {
  family: Family;
  treeId: string;
  /** Whose leaf view was open: where the map opens, ringed. */
  focusId: string | null;
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
  onPick,
}: {
  family: Family;
  map: Map_;
  screen: Frame;
  focusId: string | null;
  onPick: (id: string) => void;
}) {
  const palette = usePalette();
  // Opens showing the whole tree; if whoever was on the leaf view is on it
  // and the tree is too big to read at that size, they're still the middle.
  const opening = React.useMemo(() => {
    const fit = fitMap(map, screen, 24, ZOOM);
    const focus = focusId ? map.pills.find((p) => p.id === focusId) : null;
    if (!focus) return fit;
    const w = (map.bounds.maxX - map.bounds.minX) * fit.zoom;
    const h = (map.bounds.maxY - map.bounds.minY) * fit.zoom;
    if (w <= screen.width && h <= screen.height) return fit;
    const at = clampOffset(centreOn(focus, fit.zoom, screen), map, fit.zoom, screen);
    return { zoom: fit.zoom, ...at };
  }, [map, screen, focusId]);

  const offset = useSharedValue<XY>({ x: opening.x, y: opening.y });
  const zoom = useSharedValue(opening.zoom);
  const came = useSharedValue(0);
  React.useEffect(() => {
    came.set(withTiming(1, { duration: 240 }));
  }, [came]);

  const responder = React.useMemo(
    () => mapResponder({ map, screen, offset, zoom }),
    // The map and screen are the only inputs; the shared values are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, screen],
  );

  const moving = useAnimatedStyle(() => ({
    opacity: came.value,
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

  const w = map.bounds.maxX - map.bounds.minX;
  const h = map.bounds.maxY - map.bounds.minY;
  const pick = (id: string) => {
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    onPick(id);
  };

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
        <Svg
          width={Math.max(1, w)}
          height={Math.max(1, h)}
          viewBox={`${map.bounds.minX} ${map.bounds.minY} ${Math.max(1, w)} ${Math.max(1, h)}`}
          style={{ position: "absolute", left: map.bounds.minX, top: map.bounds.minY }}
          pointerEvents="none"
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
        {map.pills.map((pill) => {
          const person = family.people.get(pill.id);
          if (!person) return null;
          return (
            <MapPill
              key={pill.id}
              x={pill.x}
              y={pill.y}
              person={person}
              self={pill.id === family.selfId}
              focused={pill.id === focusId}
              onPress={() => pick(pill.id)}
            />
          );
        })}
      </Animated.View>
    </View>
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
 */
function MapPill({
  x,
  y,
  person,
  self,
  focused,
  onPress,
}: {
  x: number;
  y: number;
  person: FamilyPerson;
  self: boolean;
  focused: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  const deceased = !!person.is_deceased || !!person.date_of_death;
  const first = (person.preferred_name || person.first_name || person.last_name || "").trim();
  const disc = MAP_PILL_H - 10;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={personDisplayName(person)}
      accessibilityHint="Opens their leaf"
      onPress={onPress}
      hitSlop={24}
      style={({ pressed }) => [
        styles.pill,
        {
          left: x - MAP_PILL_W / 2,
          top: y - MAP_PILL_H / 2,
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
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, overflow: "hidden" },
  canvas: { position: "absolute", left: 0, top: 0, width: 1, height: 1, transformOrigin: [0, 0, 0] },
  pill: {
    position: "absolute",
    width: MAP_PILL_W,
    height: MAP_PILL_H,
    borderRadius: MAP_PILL_H / 2,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 4,
    gap: 6,
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
