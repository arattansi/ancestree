import * as Haptics from "expo-haptics";
import * as React from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Circle, Defs, Path, Pattern, Rect } from "react-native-svg";

import { roundedPolyline } from "@/lib/edge-geometry";
import { orbitLayout, orbitLines, type OrbitSide } from "@/lib/leaf-orbit";
import { nativeLeaf } from "@/lib/native-leaf";
import {
  maidenLine,
  personDisplayName,
  personLifespan,
} from "@/lib/person-name";
import { relativesOf } from "@/family/family";
import type { Family } from "@/family/load";
import { relationWord } from "@/family/words";
import { BOX_W, Leaf, leafAnchors } from "@/leaf/leaf";
import { PersonPill } from "@/leaf/person-pill";
import { usePalette } from "@/theme";

/**
 * One person as a leaf, and a gray pill for everyone one line away: parents
 * above, children below, spouses left, siblings right (`lib/leaf-orbit.ts`).
 * It is drawn as the web's canvas is (Step 179.2): a dotted ground, and
 * lines that branch off a bar and turn their corners round, in the brown of
 * the web's lit spotlight lines. A former spouse's line is dashed, as on the
 * web. Tap a pill to walk to that leaf.
 */
export function Spotlight({
  family,
  focusId,
  onWalk,
  onMore,
  onOpenLeaf,
}: {
  family: Family;
  focusId: string;
  onWalk: (id: string) => void;
  onMore: (side: OrbitSide) => void;
  onOpenLeaf: () => void;
}) {
  const palette = usePalette();
  const [frame, setFrame] = React.useState<{ width: number; height: number } | null>(
    null,
  );
  const person = family.people.get(focusId);
  const relatives = React.useMemo(
    () => relativesOf(family, focusId),
    [family, focusId],
  );
  const layout = React.useMemo(
    () => (frame ? orbitLayout(frame, relatives) : null),
    [frame, relatives],
  );

  // Each new leaf grows in from a little smaller, unless motion is reduced.
  // The first is simply there.
  const [shown] = React.useState(() => new Animated.Value(1));
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        shown.setValue(1);
        return;
      }
      shown.setValue(0);
      Animated.timing(shown, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [focusId, shown]);

  const walk = (id: string) => {
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    onWalk(id);
  };

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
  const lines = layout
    ? orbitLines(layout, anchorsOn(layout.leaf, leafAnchors(leaf.shape)))
    : [];
  const isSelf = focusId === family.selfId;
  const maiden = maidenLine(person);
  const years = [isSelf ? "You" : null, personLifespan(person)]
    .filter(Boolean)
    .join(" · ");
  const name = personDisplayName(person);
  const deceased = !!person.is_deceased || !!person.date_of_death;

  return (
    <View
      style={styles.stage}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setFrame((f) =>
          f && f.width === width && f.height === height ? f : { width, height },
        );
      }}
    >
      {frame ? <Grid width={frame.width} height={frame.height} /> : null}
      {layout ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: shown,
              transform: [
                {
                  scale: shown.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.94, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Svg
            width={frame!.width}
            height={frame!.height}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            {lines.map((line) => {
              const former =
                line.side === "spouses" && !!line.id && formerSpouses.has(line.id);
              return (
                <Path
                  key={`${line.side}:${line.id ?? "more"}`}
                  d={roundedPolyline(line.points, CORNER)}
                  stroke={palette.brown}
                  strokeOpacity={former ? 0.6 : 1}
                  strokeWidth={LINE}
                  strokeDasharray={former ? "2 5" : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              );
            })}
          </Svg>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={[name, maiden, years].filter(Boolean).join(", ")}
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

          {layout.pills.map((p) => {
            const relative = p.id ? (family.people.get(p.id) ?? null) : null;
            const label = relative
              ? `${relationWord(p.side, relative.sex, formerSpouses.has(relative.id))}, ${personDisplayName(relative)}`
              : `${p.more} more`;
            return (
              <PersonPill
                key={`${p.side}:${p.id ?? "more"}`}
                pill={p}
                size={layout.pill}
                person={relative}
                self={p.id === family.selfId}
                label={label}
                onPress={() => (p.id ? walk(p.id) : onMore(p.side))}
              />
            );
          })}
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The lines' width and their corners' radius: the web's lit lines are 3. */
const LINE = 2.5;
const CORNER = 8;

/**
 * The canvas's dotted ground, as the web's React Flow background draws it
 * (dots 20 apart). It stays put while leaves come and go over it.
 */
function Grid({ width, height }: { width: number; height: number }) {
  const palette = usePalette();
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="grid" width={20} height={20} patternUnits="userSpaceOnUse">
          <Circle cx={10} cy={10} r={0.7} fill={palette.grid} />
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
  stage: { flex: 1 },
});
