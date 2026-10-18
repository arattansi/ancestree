import * as Haptics from "expo-haptics";
import * as React from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import Svg, { Circle, Defs, Path, Pattern, Rect } from "react-native-svg";

import { connectionCaption } from "@/lib/connection-caption";
import { roundedPolyline } from "@/lib/edge-geometry";
import { NO_ADDS } from "@/lib/leaf-adds";
import { ghostLayout, shiftOrbit, type GhostFamily } from "@/lib/leaf-ghosts";
import { orbitLayout, orbitLines, type OrbitSide } from "@/lib/leaf-orbit";
import { walkMorphs, walkOffset, type WalkMorph, type WalkScene } from "@/lib/leaf-walk";
import { nativeLeaf } from "@/lib/native-leaf";
import {
  maidenLine,
  personDisplayName,
  personLifespan,
} from "@/lib/person-name";
import { addsOf, lineageOf, relativesOf } from "@/family/family";
import type { Family } from "@/family/load";
import { relationWord } from "@/family/words";
import { AddPill } from "@/leaf/add-pill";
import { Ghosts, GhostTargets } from "@/leaf/ghosts";
import { BOX_W, Leaf, leafAnchors } from "@/leaf/leaf";
import { PersonPill } from "@/leaf/person-pill";
import { font, usePalette } from "@/theme";

type XY = { x: number; y: number };
type Frame = { width: number; height: number };

/**
 * How a leaf view comes in and goes out (Step 186): a slide through the
 * tree towards whoever was walked to, a plain cross-fade when Reduce Motion
 * is on, or, when the two leaves aren't drawn in each other's views (a
 * search, home), the fade-and-grow from before.
 */
type Move =
  | { kind: "slide"; by: XY; morphs: Record<string, WalkMorph> }
  | { kind: "fade" }
  | { kind: "jump" };

/** A leaf view on screen: the one walked to, or the one walked from. */
type Stage = { key: number; focusId: string; enter: Move | null; leave: Move | null };

const DURATION: Record<Move["kind"], number> = { slide: 300, fade: 200, jump: 260 };
/**
 * Easing in as well as out, as a camera moves: an ease-out covered half the
 * way in three frames and read as a jump, not a move.
 */
const EASE = Easing.bezierFn(0.4, 0, 0.2, 1);
const CLAMP = Extrapolation.CLAMP;
/** The most of a move one frame takes, two 60 Hz frames' worth (`useClock`). */
const MAX_STEP = 1000 / 30;

/**
 * One person as a leaf, and a gray pill for everyone one line away: parents
 * above, children below, spouses left, siblings right (`lib/leaf-orbit.ts`).
 * It is drawn as the web's canvas is (Step 179.2): a dotted ground, and
 * lines that branch off a bar and turn their corners round, in the brown of
 * the web's lit spotlight lines. A former spouse's line is dashed, as on the
 * web. Tap a pill to walk to that leaf. Past the parents and the children,
 * the generations beyond show out of focus (Step 184, `lib/leaf-ghosts.ts`).
 * Where a leaf has no parents or no children and the member may add them, a
 * dashed pill asks for the first (Step 187, `lib/leaf-adds.ts`).
 * Over them all, on anyone's leaf but the member's own, a line says how the
 * leaf is connected to them (Step 185, `lib/connection-caption.ts`).
 *
 * A walk moves through the tree (Step 186, `lib/leaf-walk.ts`): the scene
 * and its ground slide until the one walked to is in the middle, and
 * whoever is in both views travels from where they were to where they
 * land, so a parent's pill grows into their leaf and the blurred
 * grandparents above it sharpen into its parent pills. Back slides the way
 * it came. The leaf view walked to takes taps at once, mid-slide.
 */
export function Spotlight({
  family,
  focusId,
  onWalk,
  onMore,
  onOpenLeaf,
  onAdd,
}: {
  family: Family;
  focusId: string;
  onWalk: (id: string) => void;
  onMore: (side: OrbitSide) => void;
  onOpenLeaf: () => void;
  /** Opens the add form for a first parent or child; none asked without it. */
  onAdd?: (relation: "parent" | "child") => void;
}) {
  const [screen, setScreen] = React.useState<Frame | null>(null);
  const asks = !!onAdd;
  const lineage = React.useMemo(() => lineageOf(family), [family]);
  const reduced = useReduceMotion();

  const [stages, setStages] = React.useState<Stage[]>(() => [
    { key: 0, focusId, enter: null, leave: null },
  ]);
  // Each walk's move, so back can undo it: a spouse is on the left from
  // either side, so the way back isn't simply the way there, mirrored.
  const moves = React.useRef<{ from: string; to: string; by: XY | null }[]>([]);
  // The leaf a pill or ghost here was tapped for; any other walk (back,
  // home, a search, the "+n" list) comes from outside.
  const tapped = React.useRef<string | null>(null);

  const shownId = stages[stages.length - 1].focusId;
  React.useLayoutEffect(() => {
    if (shownId === focusId) return;
    const from = shownId;
    const scene = (id: string): WalkScene | null =>
      screen ? walkScene(id, sceneLayout(family, lineage, id, screen, asks)) : null;
    const [was, is] = [scene(from), scene(focusId)];

    const wasTapped = tapped.current === focusId;
    tapped.current = null;
    const last = moves.current[moves.current.length - 1];
    let by: XY | null;
    if (!wasTapped && last && last.to === from && last.from === focusId) {
      moves.current.pop();
      by = last.by && { x: -last.by.x, y: -last.by.y };
    } else {
      by = was && is ? walkOffset(was, is) : null;
      moves.current.push({ from, to: focusId, by });
      if (moves.current.length > 100) moves.current.shift();
    }

    let move: Move;
    if (reduced) {
      move = { kind: "fade" };
    } else if (by && was && is) {
      move = { kind: "slide", by, morphs: walkMorphs(was, is, by) };
    } else {
      move = { kind: "jump" };
    }
    // The one walked from goes; one still going from a walk before is
    // dropped.
    setStages((s) => {
      const current = s[s.length - 1];
      return [
        { ...current, leave: move },
        { key: current.key + 1, focusId, enter: move, leave: null },
      ];
    });
  }, [focusId, shownId, screen, family, lineage, asks, reduced]);

  // The dotted ground travels with the scene walked to.
  const arriving = stages[stages.length - 1];
  const slide =
    arriving.enter?.kind === "slide" ? { key: arriving.key, by: arriving.enter.by } : null;

  const walk = (id: string) => {
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    tapped.current = id;
    onWalk(id);
  };

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
      {screen ? <Ground frame={screen} slide={slide} /> : null}
      {screen
        ? stages.map((stage) => (
            <Scene
              key={stage.key}
              family={family}
              lineage={lineage}
              focusId={stage.focusId}
              screen={screen}
              asks={asks}
              enter={stage.enter}
              leave={stage.leave}
              onWalk={walk}
              onMore={onMore}
              onOpenLeaf={onOpenLeaf}
              onAdd={onAdd}
              onGone={() => setStages((s) => s.filter((other) => other.key !== stage.key))}
            />
          ))
        : null}
    </View>
  );
}

/**
 * The leaf, its pills and its ghosts, laid out and centred together under
 * the caption's line when there is one (Step 185), with a dashed pill for
 * a first parent or child where the member may add one (Step 187).
 */
function sceneLayout(
  family: Family,
  lineage: GhostFamily,
  focusId: string,
  screen: Frame,
  asks: boolean,
) {
  const caption = connectionCaption(family.selfId, focusId, family.people, family.lines);
  const room = caption ? CAPTION_ROOM : 0;
  const frame = room ? { width: screen.width, height: screen.height - room } : screen;
  const relatives = relativesOf(family, focusId);
  const adds = asks ? addsOf(family, focusId, relatives) : NO_ADDS;
  const orbit = orbitLayout(frame, relatives, adds);
  const onScreen = new Set([
    focusId,
    ...relatives.parents,
    ...relatives.children,
    ...relatives.spouses,
    ...relatives.siblings,
  ]);
  const ghosts = ghostLayout(orbit, frame, lineage, onScreen);
  return { caption, room, frame, layout: shiftOrbit(orbit, ghosts.shift), ghosts };
}

/** A leaf view as a walk reads it: on the screen, below the caption's room. */
function walkScene(focusId: string, scene: ReturnType<typeof sceneLayout>): WalkScene {
  const { room, layout, ghosts } = scene;
  return {
    focusId,
    layout: shiftOrbit(layout, room),
    ghosts: { ...ghosts, ghosts: ghosts.ghosts.map((g) => ({ ...g, y: g.y + room })) },
  };
}

/** One leaf view, coming in (`enter`), on screen, or going out (`leave`). */
function Scene({
  family,
  lineage,
  focusId,
  screen,
  asks,
  enter,
  leave,
  onWalk,
  onMore,
  onOpenLeaf,
  onAdd,
  onGone,
}: {
  family: Family;
  lineage: GhostFamily;
  focusId: string;
  screen: Frame;
  /** Whether a first parent or child may be asked for (Step 187). */
  asks: boolean;
  enter: Move | null;
  leave: Move | null;
  onWalk: (id: string) => void;
  onMore: (side: OrbitSide) => void;
  onOpenLeaf: () => void;
  onAdd?: (relation: "parent" | "child") => void;
  /** It has gone out. */
  onGone: () => void;
}) {
  const palette = usePalette();
  const person = family.people.get(focusId);
  // The family past the pills, out of focus (Step 184), and everything moved
  // to sit in the middle together, under how they're connected to the
  // member (Step 185).
  const { caption, room, frame, layout, ghosts } = React.useMemo(
    () => sceneLayout(family, lineage, focusId, screen, asks),
    [family, lineage, focusId, screen, asks],
  );

  // How far along it is coming in and going out, evenly; the moves ease.
  const entering = useClock(enter ? 0 : 1, enter, enter ? DURATION[enter.kind] : 0);
  const leaving = useClock(0, leave, leave ? DURATION[leave.kind] : 0, onGone);

  const inKind = enter?.kind ?? "none";
  const outKind = leave?.kind ?? "none";
  const inBy = enter?.kind === "slide" ? enter.by : { x: 0, y: 0 };
  const outBy = leave?.kind === "slide" ? leave.by : { x: 0, y: 0 };
  // The whole scene: in from where the walk started, out the way it goes.
  const whole = useAnimatedStyle(() => {
    const e = EASE(entering.value);
    const l = EASE(leaving.value);
    const fadeIn =
      inKind === "jump"
        ? interpolate(entering.value, [0, 0.6], [0, 1], CLAMP)
        : inKind === "fade"
          ? entering.value
          : 1;
    const fadeOut =
      outKind === "none"
        ? 1
        : 1 - interpolate(leaving.value, [0, outKind === "fade" ? 1 : 0.5], [0, 1], CLAMP);
    return {
      opacity: fadeIn * fadeOut,
      transform: [
        { translateX: (e - 1) * inBy.x + l * outBy.x },
        { translateY: (e - 1) * inBy.y + l * outBy.y },
        { scale: inKind === "jump" ? 0.94 + 0.06 * e : 1 },
      ],
    };
  }, [inKind, outKind, inBy.x, inBy.y, outBy.x, outBy.y]);
  // Its lines and ghosts come once the people have nearly landed. Never
  // quite unseen, so they're drawn as the scene comes in, not halfway
  // through the slide, where drawing them held it up.
  const lately = useAnimatedStyle(
    () => ({
      opacity: inKind === "slide" ? interpolate(entering.value, [0.45, 1], [0.01, 1], CLAMP) : 1,
    }),
    [inKind],
  );

  const formerSpouses = React.useMemo(() => {
    const former = new Set<string>();
    for (const l of family.lines) {
      if (l.type !== "spouse" || !l.is_divorced) continue;
      if (l.from_person === focusId) former.add(l.to_person);
      if (l.to_person === focusId) former.add(l.from_person);
    }
    return former;
  }, [family, focusId]);

  if (!person) return null;
  const leaf = nativeLeaf(person);
  const lines = orbitLines(layout, anchorsOn(layout.leaf, leafAnchors(leaf.shape)));
  const isSelf = focusId === family.selfId;
  const maiden = maidenLine(person);
  const years = [isSelf ? "You" : null, personLifespan(person)]
    .filter(Boolean)
    .join(" · ");
  const name = personDisplayName(person);
  const deceased = !!person.is_deceased || !!person.date_of_death;
  const morphs = enter?.kind === "slide" ? enter.morphs : null;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { top: room }, whole]}
      pointerEvents={leave ? "none" : "box-none"}
      accessibilityElementsHidden={!!leave}
      importantForAccessibility={leave ? "no-hide-descendants" : "auto"}
    >
      <Animated.View style={[StyleSheet.absoluteFill, lately]} pointerEvents="box-none">
        {caption ? (
          // The leaf's label reads it out; this is for the eye. It clears
          // the dotted ground so the words read cleanly.
          <View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[styles.captionRow, { top: ghosts.top - CAPTION_ROOM }]}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[
                styles.caption,
                { color: palette.mutedForeground, backgroundColor: palette.background },
              ]}
            >
              {caption}
            </Text>
          </View>
        ) : null}
        {/* The lines are drawn with the ghosts: a second canvas the
            frame's size made the scene slow to come in (Step 186). */}
        <Ghosts ghosts={ghosts} width={frame.width} height={frame.height}>
          {lines.map((line) => {
            const former =
              line.side === "spouses" && !!line.id && formerSpouses.has(line.id);
            return (
              <Path
                key={`${line.side}:${line.id ?? (line.add ? "add" : "more")}`}
                d={roundedPolyline(line.points, CORNER)}
                stroke={palette.brown}
                strokeOpacity={line.add ? 0.45 : former ? 0.6 : 1}
                strokeWidth={LINE}
                strokeDasharray={line.add ? "4 5" : former ? "2 5" : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            );
          })}
        </Ghosts>
        <GhostTargets ghosts={ghosts} onWalk={onWalk} />
      </Animated.View>

      <Morph
        entering={entering}
        sliding={!!morphs}
        morph={morphs?.[focusId]}
        at={{
          x: layout.leaf.x + layout.leaf.width / 2,
          y: layout.leaf.y + layout.leaf.height / 2,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={[name, caption, maiden, years].filter(Boolean).join(", ")}
          accessibilityHint="Opens their details"
          onPress={onOpenLeaf}
          style={{
            position: "absolute",
            left: layout.leaf.x,
            top: layout.leaf.y,
          }}
        >
          <Leaf
            shape={leaf.shape}
            width={layout.leaf.width}
            name={name}
            lines={[maiden, years].filter((l): l is string => !!l)}
            deceased={deceased}
            clipId={`leaf-${focusId}`}
          />
        </Pressable>
      </Morph>

      {layout.pills.map((p) => {
        if (p.add) {
          const word = p.side === "parents" ? "parent" : "child";
          const first = person.preferred_name || person.first_name || name;
          return (
            <Morph
              key={`${p.side}:add`}
              entering={entering}
              sliding={!!morphs}
              morph={undefined}
              at={p}
            >
              <AddPill
                pill={p}
                size={layout.pill}
                word={word}
                label={`Add ${first}'s ${word}`}
                onPress={() => onAdd?.(word)}
              />
            </Morph>
          );
        }
        const relative = p.id ? (family.people.get(p.id) ?? null) : null;
        const label = relative
          ? `${relationWord(p.side, relative.sex, formerSpouses.has(relative.id))}, ${personDisplayName(relative)}`
          : `${p.more} more`;
        return (
          <Morph
            key={`${p.side}:${p.id ?? "more"}`}
            entering={entering}
            sliding={!!morphs}
            morph={p.id ? morphs?.[p.id] : undefined}
            at={p}
          >
            <PersonPill
              pill={p}
              size={layout.pill}
              person={relative}
              self={p.id === family.selfId}
              label={label}
              onPress={() => (p.id ? onWalk(p.id) : onMore(p.side))}
            />
          </Morph>
        );
      })}
    </Animated.View>
  );
}

/**
 * Someone in a leaf view coming in by a slide: from where they were in the
 * view walked from, at the size they were, to their place (`walkMorphs`).
 * Whoever wasn't drawn there fades in where they are.
 */
function Morph({
  entering,
  sliding,
  morph,
  at,
  children,
}: {
  entering: SharedValue<number>;
  sliding: boolean;
  morph: WalkMorph | undefined;
  /** Their middle, which they grow from. */
  at: XY;
  children: React.ReactNode;
}) {
  const known = !!morph;
  const { dx, dy, scale } = morph ?? { dx: 0, dy: 0, scale: 1 };
  const style = useAnimatedStyle(() => {
    if (!sliding) return { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] };
    const e = EASE(entering.value);
    return {
      opacity: known
        ? interpolate(entering.value, [0, 0.3], [0.4, 1], CLAMP)
        : interpolate(entering.value, [0.25, 0.75], [0, 1], CLAMP),
      transform: [
        { translateX: (1 - e) * dx },
        { translateY: (1 - e) * dy },
        { scale: scale + (1 - scale) * e },
      ],
    };
  }, [sliding, known, dx, dy, scale]);
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { transformOrigin: [at.x, at.y, 0] }, style]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Progress from 0 to 1 over `duration`, from when `run` is first given (and
 * again whenever it changes), a frame at a time and at most `MAX_STEP` a
 * frame. Drawing a leaf view as it comes in can hold up its first frames: a
 * clock that kept real time would have a slide half over by the first frame
 * seen, so this one slows down instead.
 */
function useClock(
  start: number,
  run: unknown,
  duration: number,
  onDone?: () => void,
  /** Just before it starts again, with how far it had got. */
  onStart?: (was: number) => void,
) {
  const progress = useSharedValue(start);
  const length = useSharedValue(Math.max(1, duration));
  const handlers = React.useRef<{
    onDone?: () => void;
    onStart?: (was: number) => void;
    stop?: () => void;
  }>({});
  const finish = () => {
    handlers.current.stop?.();
    handlers.current.onDone?.();
  };
  const clock = useFrameCallback((frame) => {
    if (progress.value >= 1) return;
    const step = Math.min(frame.timeSincePreviousFrame ?? 0, MAX_STEP);
    progress.value = Math.min(1, progress.value + step / length.value);
    if (progress.value >= 1) scheduleOnRN(finish);
  }, false);
  React.useEffect(() => {
    handlers.current = { onDone, onStart, stop: () => clock.setActive(false) };
  });
  React.useEffect(() => {
    if (run == null) return;
    handlers.current.onStart?.(progress.get());
    length.set(Math.max(1, duration));
    progress.set(0);
    clock.setActive(true);
    // Only a new run starts it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);
  return progress;
}

/** Whether Reduce Motion is on, kept up to date. */
function useReduceMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (live) setReduced(on);
    });
    const changes = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      live = false;
      changes.remove();
    };
  }, []);
  return reduced;
}

/** The caption's line, and the gap under it to whatever is highest. */
const CAPTION_LINE = 20;
const CAPTION_ROOM = CAPTION_LINE + 14;

/** The lines' width and their corners' radius: the web's lit lines are 3. */
const LINE = 2.5;
const CORNER = 8;
/** The ground's dots are this far apart. */
const DOT = 20;

/**
 * The ground under the leaves, moved along with each slide (a dot's spacing
 * over, it looks the same, so it only ever shifts by less).
 */
function Ground({ frame, slide }: { frame: Frame; slide: { key: number; by: XY } | null }) {
  const from = useSharedValue<XY>({ x: 0, y: 0 });
  const by = useSharedValue<XY>({ x: 0, y: 0 });
  const moved = useClock(1, slide?.key ?? null, DURATION.slide, undefined, (was) => {
    if (!slide) return;
    // Where the last slide had got to, and on from there.
    const e = EASE(was);
    const [at, along] = [from.get(), by.get()];
    from.set({ x: at.x + along.x * e, y: at.y + along.y * e });
    by.set(slide.by);
  });
  const style = useAnimatedStyle(() => {
    const wrap = (v: number) => ((v % DOT) + DOT) % DOT;
    const e = EASE(moved.value);
    return {
      transform: [
        { translateX: wrap(from.value.x + by.value.x * e) },
        { translateY: wrap(from.value.y + by.value.y * e) },
      ],
    };
  });
  const width = frame.width + 2 * DOT;
  const height = frame.height + 2 * DOT;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", left: -DOT, top: -DOT, width, height }, style]}
    >
      <Grid width={width} height={height} />
    </Animated.View>
  );
}

/**
 * The canvas's dotted ground, as the web's React Flow background draws it
 * (dots 20 apart).
 */
function Grid({ width, height }: { width: number; height: number }) {
  const palette = usePalette();
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="grid" width={DOT} height={DOT} patternUnits="userSpaceOnUse">
          <Circle cx={DOT / 2} cy={DOT / 2} r={0.7} fill={palette.grid} />
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill="url(#grid)" />
    </Svg>
  );
}

/** A leaf's anchors (box units) where the leaf is on screen (points). */
function anchorsOn(
  leaf: { x: number; y: number; width: number },
  anchors: Record<OrbitSide, { x: number; y: number }>,
) {
  const scale = leaf.width / BOX_W;
  const on = (p: { x: number; y: number }) => ({
    x: leaf.x + p.x * scale,
    y: leaf.y + p.y * scale,
  });
  return {
    parents: on(anchors.parents),
    children: on(anchors.children),
    spouses: on(anchors.spouses),
    siblings: on(anchors.siblings),
  };
}

const styles = StyleSheet.create({
  stage: { flex: 1, overflow: "hidden" },
  captionRow: { position: "absolute", left: 24, right: 24, alignItems: "center" },
  caption: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: CAPTION_LINE,
    paddingHorizontal: 6,
    borderRadius: 6,
    overflow: "hidden",
  },
});
