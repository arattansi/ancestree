/**
 * The family beyond the iPhone app's leaf view (Step 184): smaller, blurred
 * pills a line further out than the rows — grandparents above the parents'
 * pills, grandchildren below the children's — and, fainter still, the
 * generation past them, so the screen shows that the tree goes on that way
 * (Aalim: "show blurred out nodes extending from the ones visible to show
 * that there are connections in that direction … the UI above and below
 * the person spotlighted feels too bare").
 *
 * Only the rows reach out: up and down are generations, so a parent's
 * parents are above them and a child's children below. Whoever is on screen
 * already (the leaf and everyone one line from it) is never drawn again,
 * and nobody is drawn twice.
 *
 * Each pill's ghosts gather over (or under) it, at most `MAX_EACH`; when a
 * row is too wide for the screen, the largest families give way first. The
 * groups keep their pills' order and sit as near over their pills as they
 * can without meeting. When the frame is too short for every generation,
 * the outermost go first; past the last one drawn, a short line from each
 * ghost (or pill) whose tree goes on says there is more. Then everything,
 * leaf, pills and ghosts, is centred in the frame together, so a leaf with
 * family only above isn't left with an empty half below. Pure, so it is
 * tested without a phone.
 */

import { EDGE, tidyPolyline, type OrbitLayout, type PillSize } from "@/lib/leaf-orbit";
import { BLADE_OVERHANG } from "@/lib/leaf-shapes";

type XY = { x: number; y: number };

export type GhostDirection = "up" | "down";

export type Ghost = {
  id: string;
  /** The pill on screen it is reached through: a tap walks there. */
  via: string;
  /** 1 for a pill's own parents or children, 2 for theirs. */
  depth: number;
  direction: GhostDirection;
  /** Its centre. */
  x: number;
  y: number;
};

export type GhostLine = {
  depth: number;
  /** Corners, in order: up, down and across only, as the pills' lines are. */
  points: XY[];
};

export type GhostLayout = {
  /** Each generation's size, by depth (index 0 is depth 1). */
  sizes: PillSize[];
  ghosts: Ghost[];
  lines: GhostLine[];
  /** Short lines fading out past the last generation drawn. */
  stubs: { depth: number; from: XY; to: XY }[];
  /**
   * How far down (up, when negative) the leaf and its pills move so that
   * everything drawn, ghosts and all, sits in the middle of the frame
   * (`shiftOrbit`). The ghosts are placed with it already.
   */
  shift: number;
  /**
   * The highest point drawn once moved, the leaf, its pills, the ghosts and
   * the lines fading out over them: what the leaf view's caption sits over
   * (Step 185).
   */
  top: number;
};

export type GhostFamily = {
  parentsOf: (id: string) => readonly string[];
  childrenOf: (id: string) => readonly string[];
};

/** Each generation out: its pills' scale, and the gap to the one before. */
const GENERATIONS = [
  { scale: 0.8, ring: 24 },
  { scale: 0.64, ring: 18 },
] as const;
/** At most this many ghosts over (or under) one pill. */
export const MAX_EACH = 4;
/** Between ghosts of one pill, and between one pill's ghosts and the next's. */
const GAP = 6;
const GROUP_GAP = 14;
/** How far a "there's more" line reaches. */
export const STUB = 16;

type Source = { id: string; via: string; x: number; y: number; height: number };
type Generation = { ghosts: Ghost[]; lines: GhostLine[]; top: number; bottom: number };

export function ghostLayout(
  layout: OrbitLayout,
  frame: { width: number; height: number },
  family: GhostFamily,
  /** The leaf and everyone one line from it. */
  shown: ReadonlySet<string>,
): GhostLayout {
  const sizes = GENERATIONS.map(({ scale }) => ({
    width: Math.round(layout.pill.width * scale),
    height: Math.round(layout.pill.height * scale),
  }));
  const taken = new Set(shown);

  const sides = (["up", "down"] as const).map((direction) => {
    const next = direction === "up" ? family.parentsOf : family.childrenOf;
    const sign = direction === "up" ? -1 : 1;
    const side = direction === "up" ? "parents" : "children";
    const pills: Source[] = layout.pills
      .filter((p) => p.side === side && p.id)
      .map((p) => ({ id: p.id!, via: p.id!, x: p.x, y: p.y, height: layout.pill.height }));
    const edgeY = (s: Source) => s.y + (sign * s.height) / 2;

    const generations: Generation[] = [];
    let sources = pills;
    for (let g = 0; g < GENERATIONS.length && sources.length > 0; g++) {
      const size = sizes[g];
      const depth = g + 1;
      // Everyone a line further out, a source's own first come first.
      const groups = sources
        .map((s) => ({
          source: s,
          ids: next(s.id).filter((id) => {
            if (taken.has(id)) return false;
            taken.add(id);
            return true;
          }),
        }))
        .filter((group) => group.ids.length > 0);
      if (groups.length === 0) break;

      const rowY = edgeY(sources[0]) + sign * (GENERATIONS[g].ring + size.height / 2);
      const placed = placeRow(
        groups.map(({ source, ids }) => ({ at: source.x, count: Math.min(ids.length, MAX_EACH) })),
        size.width,
        frame.width,
      );
      const generation: Generation = {
        ghosts: [],
        lines: [],
        top: rowY - size.height / 2,
        bottom: rowY + size.height / 2,
      };
      const nextSources: Source[] = [];
      groups.forEach(({ source, ids }, i) => {
        const xs = placed[i];
        // Those who lost their place are not drawn: the next walk shows them.
        for (const id of ids.slice(xs.length)) taken.delete(id);
        const from = { x: source.x, y: edgeY(source) };
        const ghostEdge = rowY - (sign * size.height) / 2;
        const barY = (from.y + ghostEdge) / 2;
        xs.forEach((x, k) => {
          const id = ids[k];
          generation.ghosts.push({ id, via: source.via, depth, direction, x, y: rowY });
          generation.lines.push({
            depth,
            points: tidyPolyline([
              from,
              { x: from.x, y: barY },
              { x, y: barY },
              { x, y: ghostEdge },
            ]),
          });
          nextSources.push({ id, via: source.via, x, y: rowY, height: size.height });
        });
      });
      generations.push(generation);
      sources = nextSources;
    }
    return { direction, next, sign, pills, edgeY, generations };
  });
  const [up, down] = sides;

  // Too tall for the frame: the outermost generation goes, from the side
  // with more of them, or the one reaching further, until it all fits.
  const core = coreOf(layout);
  const extent = () => ({
    top: Math.min(core.top, ...up.generations.map((g) => g.top)),
    bottom: Math.max(core.bottom, ...down.generations.map((g) => g.bottom)),
  });
  for (;;) {
    const { top, bottom } = extent();
    if (bottom - top <= frame.height - 2 * EDGE) break;
    const reach = { up: core.top - top, down: bottom - core.bottom };
    const cut =
      up.generations.length !== down.generations.length
        ? up.generations.length > down.generations.length
          ? up
          : down
        : reach.up >= reach.down
          ? up
          : down;
    if (cut.generations.length === 0) break;
    cut.generations.pop();
  }

  const ghosts = sides.flatMap((s) => s.generations.flatMap((g) => g.ghosts));
  const lines = sides.flatMap((s) => s.generations.flatMap((g) => g.lines));
  const drawn = new Set([...shown, ...ghosts.map((g) => g.id)]);
  // Past the last generation drawn, a line out from each one whose tree
  // goes on: from the last ghosts, or from the pills when none fit.
  const stubs: GhostLayout["stubs"] = [];
  for (const s of sides) {
    const depth = s.generations.length;
    const last: Source[] =
      depth === 0
        ? s.pills
        : s.generations[depth - 1].ghosts.map((g) => ({
            ...g,
            height: sizes[depth - 1].height,
          }));
    for (const source of last) {
      if (!s.next(source.id).some((id) => !drawn.has(id))) continue;
      const from = { x: source.x, y: s.edgeY(source) };
      stubs.push({ depth: depth + 1, from, to: { x: from.x, y: from.y + s.sign * STUB } });
    }
  }

  const { top, bottom } = extent();
  const centred = (frame.height - top - bottom) / 2;
  const shift = Math.abs(centred) < 0.01 ? 0 : centred;
  const move = (p: XY) => ({ x: p.x, y: p.y + shift });
  const highest = Math.min(top, ...stubs.map((s) => s.to.y)) + shift;
  return {
    sizes,
    ghosts: ghosts.map((g) => ({ ...g, y: g.y + shift })),
    lines: lines.map((l) => ({ ...l, points: l.points.map(move) })),
    stubs: stubs.map((s) => ({ ...s, from: move(s.from), to: move(s.to) })),
    shift,
    top: highest,
  };
}

/** The leaf and its pills, moved `dy` down: where `GhostLayout.shift` puts them. */
export function shiftOrbit(layout: OrbitLayout, dy: number): OrbitLayout {
  if (dy === 0) return layout;
  return {
    ...layout,
    leaf: { ...layout.leaf, y: layout.leaf.y + dy },
    pills: layout.pills.map((p) => ({ ...p, y: p.y + dy })),
  };
}

/** Top and bottom of the leaf, a maple's lobes included, and its pills. */
function coreOf(layout: OrbitLayout) {
  const { leaf, pill, pills } = layout;
  const overhang = (BLADE_OVERHANG * leaf.width) / 208;
  return {
    top: Math.min(leaf.y - overhang, ...pills.map((p) => p.y - pill.height / 2)),
    bottom: Math.max(
      leaf.y + leaf.height + overhang,
      ...pills.map((p) => p.y + pill.height / 2),
    ),
  };
}

/**
 * Centres for each group's ghosts along a row: each group as near over its
 * pill (`at`) as it can be, in order, never meeting the next, inside the
 * frame's edges. Groups too many for the row lose ghosts, the largest first,
 * down to one each; past that the last groups lose their place.
 */
export function placeRow(
  groups: { at: number; count: number }[],
  width: number,
  frameWidth: number,
): number[][] {
  const pitch = width + GAP;
  const counts = groups.map((g) => g.count);
  const span = (n: number) => (n > 0 ? n * pitch - GAP : 0);
  const room = frameWidth - 2 * EDGE;
  const total = () => {
    const shown = counts.filter((n) => n > 0);
    return (
      shown.reduce((s, n) => s + span(n), 0) +
      Math.max(0, shown.length - 1) * GROUP_GAP
    );
  };
  while (total() > room) {
    const widest = counts.indexOf(Math.max(...counts));
    if (counts[widest] > 1) {
      counts[widest] -= 1;
    } else {
      let last = counts.length - 1;
      while (counts[last] === 0) last -= 1;
      counts[last] = 0;
    }
  }

  // Blocks of groups that would otherwise meet, each block centred on where
  // its groups would be on their own, then kept inside the edges.
  type Block = { members: number[]; left: number; width: number };
  const live = groups.map((_, i) => i).filter((i) => counts[i] > 0);
  const lay = (members: number[]): Block => {
    let offset = 0;
    let wanted = 0;
    for (const i of members) {
      wanted += groups[i].at - offset - span(counts[i]) / 2;
      offset += span(counts[i]) + GROUP_GAP;
    }
    const blockWidth = offset - GROUP_GAP;
    const left = Math.min(
      frameWidth - EDGE - blockWidth,
      Math.max(EDGE, wanted / members.length),
    );
    return { members, left, width: blockWidth };
  };
  const blocks = live.map((i) => lay([i]));
  for (let merged = true; merged; ) {
    merged = false;
    for (let b = 0; b + 1 < blocks.length; b++) {
      const [a, c] = [blocks[b], blocks[b + 1]];
      if (a.left + a.width + GROUP_GAP > c.left + 0.001) {
        blocks.splice(b, 2, lay([...a.members, ...c.members]));
        merged = true;
        break;
      }
    }
  }

  const xs: number[][] = groups.map(() => []);
  for (const block of blocks) {
    let left = block.left;
    for (const i of block.members) {
      for (let k = 0; k < counts[i]; k++) xs[i].push(left + k * pitch + width / 2);
      left += span(counts[i]) + GROUP_GAP;
    }
  }
  return xs;
}
