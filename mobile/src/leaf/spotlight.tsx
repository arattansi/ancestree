import * as Haptics from "expo-haptics";
import * as React from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
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
import { orbitLayout, orbitLines, type OrbitSide, type PillSize } from "@/lib/leaf-orbit";
import {
  walkMorphs,
  walkOffset,
  type WalkMorph,
  type WalkMorphs,
  type WalkScene,
} from "@/lib/leaf-walk";
import { leafLabel, nativeLeaf } from "@/lib/native-leaf";
import { isBirthday } from "@/lib/occasions";
import {
  maidenLine,
  personDisplayName,
  personLifespan,
} from "@/lib/person-name";
import { addsOf, lineageOf, relativesOf } from "@/family/family";
import type { Family } from "@/family/load";
import { useToday } from "@/family/today";
import { relationWord } from "@/family/words";
import { AddPill } from "@/leaf/add-pill";
import { DESCRIPTOR_ROOM, LeafDescriptor } from "@/leaf/descriptor";
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
  | { kind: "slide"; by: XY; morphs: WalkMorphs }
  | { kind: "fade" }
  | { kind: "jump" };

/** A leaf view on screen: the one walked to, or the one walked from. */
type Stage = { key: number; focusId: string; enter: Move | null; leave: Move | null };

/** A slide takes as long as the web's cards and camera take to glide. */
const DURATION: Record<Move["kind"], number> = { slide: 560, fade: 200, jump: 260 };
/**
 * The web's camera's ease-out quint (`components/tree/family-tree.tsx`):
 * quick away, a long settle (Step 189).
 */
export const EASE = (t: number) => {
  "worklet";
  return 1 - (1 - t) ** 5;
};
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
 * leaf is connected to them (Step 185, `lib/connection-caption.ts`); under
 * them, above the menu bar, a pill says what the leaf is (Step 199).
 *
 * A walk moves through the tree (Step 186, `lib/leaf-walk.ts`): the scene
 * and its ground slide until the one walked to is in the middle, and
 * whoever is in both views glides from where they were to where they land,
 * as cards do on the web (Step 189): a parent's pill grows into their leaf,
 * the leaf walked from shrinks into its pill, the blurred grandparents above
 * sharpen into the parent's pills and pills shrink away into ghosts. Back
 * slides the way it came. The leaf view walked to takes taps at once,
 * mid-slide.
 *
 * As the whole tree opens out of it (`closing`, Step 209), the leaf view
 * stays under the map: its leaf and pills are the map's to move from the
 * first frame, and its lines, ghosts, caption and dashed pills fade as the
 * map comes, rather than going all at once.
 */
export function Spotlight({
  family,
  focusId,
  closing = null,
  onWalk,
  onMore,
  onOpenLeaf,
  onAdd,
  onBackground,
}: {
  family: Family;
  focusId: string;
  /** How far the whole tree has opened out of this leaf view, 0 to 1. */
  closing?: SharedValue<number> | null;
  onWalk: (id: string) => void;
  onMore: (side: OrbitSide) => void;
  onOpenLeaf: () => void;
  /** Opens the add form for a first parent or child; none asked without it. */
  onAdd?: (relation: "parent" | "child") => void;
  /**
   * A tap on the ground, away from everyone: opens the whole tree (Step
   * 206), told where the leaf and its pills are, so it can grow out of them.
   */
  onBackground?: (places: SpotlightPlaces | null) => void;
}) {
  const [screen, setScreen] = React.useState<Frame | null>(null);
  // Where the dotted ground has slid to, for the map to carry on from.
  const groundAt = React.useRef<() => XY>(() => ({ x: 0, y: 0 }));
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
      pointerEvents={closing ? "none" : "auto"}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setScreen((f) =>
          f && f.width === width && f.height === height ? f : { width, height },
        );
      }}
    >
      {/* The map draws the ground once it opens, from where this one was. */}
      {screen && !closing ? <Ground frame={screen} slide={slide} atRef={groundAt} /> : null}
      {onBackground ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="The whole tree"
          accessibilityHint="Shows everyone on the tree, small"
          style={StyleSheet.absoluteFill}
          onPress={() =>
            onBackground(
              screen
                ? spotlightPlaces(family, lineage, focusId, screen, asks, groundAt.current())
                : null,
            )
          }
        />
      ) : null}
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
              closing={closing}
              onWalk={walk}
              onMore={onMore}
              onOpenLeaf={onOpenLeaf}
              onAdd={onAdd}
              onGone={() => setStages((s) => s.filter((other) => other.key !== stage.key))}
            />
          ))
        : null}
      <Fading closing={closing}>
        <LeafDescriptor person={family.people.get(focusId)} />
      </Fading>
    </View>
  );
}

/** How soon, in the map's opening (0 to 1), the leaf view's lines and the rest are gone. */
const CLOSED_BY = 0.35;

/** What the map doesn't draw, fading as it opens over the leaf view. */
function Fading({
  closing,
  children,
}: {
  closing: SharedValue<number> | null;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(
    () => ({
      opacity: closing ? interpolate(closing.value, [0, CLOSED_BY], [1, 0], CLAMP) : 1,
    }),
    [closing],
  );
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="box-none">
      {children}
    </Animated.View>
  );
}

/**
 * The leaf, its pills and its ghosts, laid out and centred together under
 * the caption's line when there is one (Step 185) and over the leaf's
 * descriptor (Step 199), with a dashed pill for a first parent or child
 * where the member may add one (Step 187).
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
  const frame = { width: screen.width, height: screen.height - room - DESCRIPTOR_ROOM };
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

/** Where a leaf view's leaf and pills are on the screen (Step 206). */
export type SpotlightPlaces = {
  /** The leaf's box, from its top left. */
  leaf: { x: number; y: number; width: number; height: number };
  pill: PillSize;
  /** Each relative's pill's centre, by their id. */
  pills: Map<string, XY>;
  /** The leaf view's size: the map's too, so it draws in its first frame (Step 209). */
  screen: Frame;
  /** How far the dotted ground had slid, under a dot's spacing. */
  ground: XY;
};

/**
 * The leaf and its relatives' pills as they are on the screen, for the
 * whole-tree map to open out of (Step 206).
 */
export function spotlightPlaces(
  family: Family,
  lineage: GhostFamily,
  focusId: string,
  screen: Frame,
  asks: boolean,
  ground: XY = { x: 0, y: 0 },
): SpotlightPlaces {
  const { layout } = walkScene(focusId, sceneLayout(family, lineage, focusId, screen, asks));
  const pills = new Map<string, XY>();
  for (const p of layout.pills) if (p.id) pills.set(p.id, { x: p.x, y: p.y });
  return { leaf: layout.leaf, pill: layout.pill, pills, screen, ground };
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
  closing,
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
  /**
   * The whole tree opening over it (Step 209): the leaf and the relatives'
   * pills are the map's, and the rest fades.
   */
  closing: SharedValue<number> | null;
  onWalk: (id: string) => void;
  onMore: (side: OrbitSide) => void;
  onOpenLeaf: () => void;
  onAdd?: (relation: "parent" | "child") => void;
  /** It has gone out. */
  onGone: () => void;
}) {
  const palette = usePalette();
  const person = family.people.get(focusId);
  const today = useToday();
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
  // A slide fades its people one by one (`Morph`), not the scene.
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
      outKind === "none" || outKind === "slide"
        ? 1
        : 1 - interpolate(leaving.value, [0, outKind === "fade" ? 1 : 0.5], [0, 1], CLAMP);
    const shut = closing ? interpolate(closing.value, [0, CLOSED_BY], [1, 0], CLAMP) : 1;
    return {
      opacity: fadeIn * fadeOut * shut,
      transform: [
        { translateX: (e - 1) * inBy.x + l * outBy.x },
        { translateY: (e - 1) * inBy.y + l * outBy.y },
        { scale: inKind === "jump" ? 0.94 + 0.06 * e : 1 },
      ],
    };
  }, [inKind, outKind, inBy.x, inBy.y, outBy.x, outBy.y, closing]);
  // Its lines and ghosts come once the people have nearly landed, and go
  // as soon as they set off, the lines being tied to where they were. Never
  // quite unseen coming in, so they're drawn as the scene comes in, not
  // halfway through the slide, where drawing them held it up.
  const lately = useAnimatedStyle(
    () => ({
      opacity:
        (inKind === "slide" ? interpolate(entering.value, [0.15, 0.5], [0.01, 1], CLAMP) : 1) *
        (outKind === "slide" ? interpolate(leaving.value, [0, 0.1], [1, 0], CLAMP) : 1),
    }),
    [inKind, outKind],
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
  // Their birthday, by the web's rules (Step 205): candles on the leaf.
  const birthday = isBirthday(person, today);
  // Who glides in from the view walked from, and who glides out to the one
  // walked to.
  const walk: Walk = {
    entering,
    leaving,
    arrive: enter?.kind === "slide" ? enter.morphs.arrive : null,
    leave: leave?.kind === "slide" ? leave.morphs.leave : null,
  };

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

      {closing ? null : (
        <Morph
          walk={walk}
          id={focusId}
          at={{
            x: layout.leaf.x + layout.leaf.width / 2,
            y: layout.leaf.y + layout.leaf.height / 2,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={[
              name,
              caption,
              maiden,
              years,
              leafLabel(leaf),
              birthday ? "Birthday today" : null,
            ]
              .filter(Boolean)
              .join(", ")}
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
              birthday={birthday}
            />
          </Pressable>
        </Morph>
      )}

      {layout.pills.map((p) => {
        if (p.add) {
          const word = p.side === "parents" ? "parent" : "child";
          const first = person.preferred_name || person.first_name || name;
          return (
            <Morph key={`${p.side}:add`} walk={walk} id={null} at={p}>
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
        // On the map, gliding from here.
        if (closing && p.id) return null;
        const relative = p.id ? (family.people.get(p.id) ?? null) : null;
        const label = relative
          ? `${relationWord(p.side, relative.sex, formerSpouses.has(relative.id))}, ${personDisplayName(relative)}`
          : `${p.more} more`;
        return (
          <Morph key={`${p.side}:${p.id ?? "more"}`} walk={walk} id={p.id} at={p}>
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
 * A leaf view's slides: how far along it is coming in and going out, and
 * the people who glide in from the view walked from (`arrive`) and out to
 * the one walked to (`leave`); null when it doesn't come in or go out by a
 * slide.
 */
type Walk = {
  entering: SharedValue<number>;
  leaving: SharedValue<number>;
  arrive: WalkMorphs["arrive"] | null;
  leave: WalkMorphs["leave"] | null;
};

/**
 * Someone in a leaf view as it slides (Step 189, `walkMorphs`). Whoever
 * both views draw is drawn twice on the way, once by each, the two copies
 * taking the same path from the old place and size to the new and handing
 * over by a cross-fade (`handover`). Whoever only one view draws fades in
 * or out where they are.
 */
function Morph({
  walk,
  id,
  at,
  children,
}: {
  walk: Walk;
  id: string | null;
  /** Their middle, which they grow from. */
  at: XY;
  children: React.ReactNode;
}) {
  const { entering, leaving } = walk;
  const inSlide = !!walk.arrive;
  const outSlide = !!walk.leave;
  const arrive = (id && walk.arrive?.[id]) || NO_MORPH;
  const depart = (id && walk.leave?.[id]) || NO_MORPH;
  const [in0, in1, faint] = handover(id ? walk.arrive?.[id] : undefined, true);
  const [out0, out1] = handover(id ? walk.leave?.[id] : undefined, false);
  const style = useAnimatedStyle(() => {
    // Coming in, from where they were (scaled as they were) to their place;
    // going out, from their place to where they go.
    const e = inSlide ? EASE(entering.value) : 1;
    const l = outSlide ? EASE(leaving.value) : 0;
    const opacity =
      (inSlide ? interpolate(entering.value, [in0, in1], [faint, 1], CLAMP) : 1) *
      (outSlide ? interpolate(leaving.value, [out0, out1], [1, 0], CLAMP) : 1);
    return {
      opacity,
      transform: [
        { translateX: (1 - e) * arrive.dx + l * depart.dx },
        { translateY: (1 - e) * arrive.dy + l * depart.dy },
        {
          scale:
            (arrive.scale + (1 - arrive.scale) * e) * (1 + (depart.scale - 1) * l),
        },
      ],
    };
  }, [inSlide, outSlide, arrive, depart, in0, in1, faint, out0, out1]);
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { transformOrigin: [at.x, at.y, 0] }, style]}
    >
      {children}
    </Animated.View>
  );
}

const NO_MORPH: WalkMorph = { dx: 0, dy: 0, scale: 1, from: "pill", to: "pill" };

/**
 * When, in a slide's time (0 to 1, evenly), someone's copy fades in as it
 * arrives or out as it leaves, and how faint an arriving one starts. A
 * leaf looks right at any size and a pill doesn't, so a pill growing into a
 * leaf hands over to the leaf at once, before the pill's ends stand out
 * past it, and a leaf shrinking into a pill only once it's nearly a pill's
 * size, quickly, so the two names barely overlap. The same pill in both
 * views hands over at once. A pill sharpens out of its ghost, and shrinks away into one
 * as the new view's ghosts come. Anyone only one view draws fades in about
 * 300 ms, as cards do on the web. The arriving copy is drawn over the
 * leaving one, which stays until it has come. Never quite unseen: a copy
 * held unseen is drawn only when it shows, mid-slide (Step 186).
 */
function handover(m: WalkMorph | undefined, arriving: boolean): [number, number, number] {
  if (arriving) {
    if (!m) return [0.1, 0.65, 0.01];
    if (m.from === "ghost") return [0, 0.3, 0.3];
    if (m.to === "leaf") return [0, 0.1, 0.01];
    if (m.from === "leaf") return [0.22, 0.34, 0.01];
    return [0, 0.1, 0.01];
  }
  if (!m) return [0, 0.5, 0];
  if (m.to === "ghost") return [0.1, 0.45, 0];
  if (m.to === "leaf") return [0.04, 0.12, 0];
  if (m.from === "leaf") return [0.27, 0.37, 0];
  return [0.1, 0.15, 0];
}

/**
 * Progress from 0 to 1 over `duration`, from when `run` is first given (and
 * again whenever it changes), a frame at a time and at most `MAX_STEP` a
 * frame. Drawing a leaf view as it comes in can hold up its first frames: a
 * clock that kept real time would have a slide half over by the first frame
 * seen, so this one slows down instead.
 */
export function useClock(
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
export const DOT = 20;

/** How far past the last dot: a ground slid by this looks the same. */
export const wrapDot = (v: number) => {
  "worklet";
  return ((v % DOT) + DOT) % DOT;
};

/**
 * The ground under the leaves, moved along with each slide (a dot's spacing
 * over, it looks the same, so it only ever shifts by less).
 */
function Ground({
  frame,
  slide,
  atRef,
}: {
  frame: Frame;
  slide: { key: number; by: XY } | null;
  /** Set to tell where it has slid to (Step 209). */
  atRef: React.RefObject<() => XY>;
}) {
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
  React.useEffect(() => {
    atRef.current = () => {
      const e = EASE(moved.get());
      const [f, b] = [from.get(), by.get()];
      return { x: wrapDot(f.x + b.x * e), y: wrapDot(f.y + b.y * e) };
    };
  });
  const style = useAnimatedStyle(() => {
    const e = EASE(moved.value);
    return {
      transform: [
        { translateX: wrapDot(from.value.x + by.value.x * e) },
        { translateY: wrapDot(from.value.y + by.value.y * e) },
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
 * (dots 20 apart). The whole-tree map draws it too (Step 206).
 */
export function Grid({ width, height }: { width: number; height: number }) {
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
