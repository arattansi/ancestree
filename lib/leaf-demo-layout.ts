/**
 * The /features demo's little tree (Step 112): who is related to whom, and
 * where each leaf goes. Pure, so it's tested on its own.
 *
 * Laid out on the canvas's grid (`lib/tree-dimensions.ts`) as a pulled-out
 * line is: everyone in a generation's row, partners `COUPLE_GAP` apart,
 * everything else at least `GUTTER`, and each family's children centred
 * under their parents. A sibling with no parents on the tree hangs beside
 * the one they're a sibling of, a dashed bracket over the pair (Step 19.3).
 */

import {
  descentGeometry,
  leafBranchPath,
  leafLandX,
  roundedPolyline,
  siblingBracketPoints,
  type CardRect,
  type Descent,
} from "@/lib/edge-geometry";
import {
  COUPLE_GAP,
  GUTTER,
  NODE_H,
  NODE_W,
  ROW_H,
} from "@/lib/tree-dimensions";

export type Relation = "partner" | "child" | "sibling";

export const RELATIONS: { value: Relation; label: string }[] = [
  { value: "partner", label: "Partner of" },
  { value: "child", label: "Child of" },
  { value: "sibling", label: "Sibling of" },
];

export type Person = { first: string; last: string; place: string };

export type DemoPerson = Person & {
  id: string;
  /** Their parents on the tree: none, one, or a couple. */
  parents: string[];
  partner: string | null;
  /** A sibling with no parents on the tree: who they're a sibling of. */
  siblingOf: string | null;
};

/** Whether `relation` to `of` can be added: one partner each. */
export function canRelate(
  people: DemoPerson[],
  relation: Relation,
  of: string,
): boolean {
  const anchor = people.find((p) => p.id === of);
  if (!anchor) return false;
  return relation !== "partner" || !anchor.partner;
}

/**
 * `people` with `person` added as `relation` of `of`. A child is the child
 * of `of` and their partner; a sibling shares `of`'s parents, or, with none
 * on the tree, is joined to `of` by a bracket.
 */
export function addRelative(
  people: DemoPerson[],
  person: Person,
  id: string,
  relation: Relation,
  of: string,
): DemoPerson[] {
  const anchor = people.find((p) => p.id === of);
  if (!anchor) throw new Error(`No one called ${of} on the demo tree`);
  const added: DemoPerson = {
    ...person,
    id,
    parents: [],
    partner: null,
    siblingOf: null,
  };
  if (relation === "partner") {
    added.partner = anchor.id;
    return [
      ...people.map((p) => (p.id === of ? { ...p, partner: id } : p)),
      added,
    ];
  }
  if (relation === "child")
    added.parents = [anchor.id, anchor.partner].filter((x): x is string => !!x);
  else if (anchor.parents.length) added.parents = anchor.parents;
  else added.siblingOf = anchor.id;
  return [...people, added];
}

/** People standing side by side in one row, and the families under them. */
type Unit = { members: string[]; gaps: number[]; children: Unit[] };

const width = (u: Unit) =>
  u.members.length * NODE_W + u.gaps.reduce((a, b) => a + b, 0);

export type DemoLayout = {
  cards: Map<string, CardRect>;
  /** The box every leaf fits in, with room for blades, brackets and marks. */
  bounds: { left: number; top: number; width: number; height: number };
};

/**
 * Where everyone's leaf goes. The first person is the root; the rest join
 * in the order they were added: a child under their parents, a partner
 * beside them, a sibling with no parents beside the one they're a sibling
 * of, on the outside of a couple.
 */
export function layoutDemo(people: DemoPerson[]): DemoLayout {
  const unitOf = new Map<string, Unit>();
  let root: Unit | null = null;

  for (const p of people) {
    if (p.parents.length) {
      const unit: Unit = { members: [p.id], gaps: [], children: [] };
      unitOf.get(p.parents[0])?.children.push(unit);
      unitOf.set(p.id, unit);
      continue;
    }
    const anchor = [p.partner, p.siblingOf].find((a) => a && unitOf.has(a));
    if (!anchor) {
      root = { members: [p.id], gaps: [], children: [] };
      unitOf.set(p.id, root);
      continue;
    }
    const unit = unitOf.get(anchor)!;
    const i = unit.members.indexOf(anchor);
    const gap = p.partner === anchor ? COUPLE_GAP : GUTTER;
    // The left end of a pair takes the newcomer on its left; anyone else,
    // on their right.
    if (i === 0 && unit.members.length > 1) {
      unit.members.unshift(p.id);
      unit.gaps.unshift(gap);
    } else {
      unit.members.splice(i + 1, 0, p.id);
      unit.gaps.splice(i, 0, gap);
    }
    unitOf.set(p.id, unit);
  }

  const cards = new Map<string, CardRect>();
  if (!root) return { cards, bounds: { left: 0, top: 0, width: 0, height: 0 } };

  const parentsOf = new Map(people.map((p) => [p.id, p.parents]));
  // A child unit's first member is the one with parents here. Families sit
  // in the order their parents stand, left to right.
  const childrenOf = (u: Unit) => {
    const at = (c: Unit) =>
      Math.min(
        ...(parentsOf.get(c.members[0]) ?? []).map((id) =>
          u.members.indexOf(id),
        ),
      );
    return [...u.children].sort((a, b) => at(a) - at(b));
  };
  const childrenWidth = (u: Unit): number => {
    const kids = childrenOf(u);
    return kids.length
      ? kids.reduce((sum, c) => sum + span(c), 0) + GUTTER * (kids.length - 1)
      : 0;
  };
  const span = (u: Unit): number => Math.max(width(u), childrenWidth(u));

  const place = (u: Unit, left: number, row: number) => {
    const room = span(u);
    let x = left + (room - width(u)) / 2;
    u.members.forEach((id, i) => {
      cards.set(id, { x, y: row * ROW_H, w: NODE_W, h: NODE_H });
      x += NODE_W + (u.gaps[i] ?? 0);
    });
    let cx = left + (room - childrenWidth(u)) / 2;
    for (const c of childrenOf(u)) {
      place(c, cx, row + 1);
      cx += span(c) + GUTTER;
    }
  };
  place(root, 0, 0);

  const all = [...cards.values()];
  const bracketed = people.some((p) => p.siblingOf && cards.has(p.siblingOf));
  const left = Math.min(...all.map((c) => c.x)) - MARGIN.x;
  const top =
    Math.min(...all.map((c) => c.y)) -
    MARGIN.top -
    (bracketed ? MARGIN.bracket : 0);
  return {
    cards,
    bounds: {
      left,
      top,
      width: Math.max(...all.map((c) => c.x + c.w)) + MARGIN.x - left,
      height: Math.max(...all.map((c) => c.y + c.h)) + MARGIN.bottom - top,
    },
  };
}

/** Room around the leaves: a blade overhangs its card box top and bottom,
 *  and a bracket rises over its row. */
const MARGIN = { x: 8, top: 32, bottom: 24, bracket: 24 };

export type DemoLines = {
  couples: string[];
  /** One per child: down from their parents to just above their blade. */
  branches: { child: string; path: (bladeTop: number) => string }[];
  brackets: string[];
};

/**
 * The lines between `people`'s leaves, as a spotlight routes them. A child's
 * branch stops over its own blade, so it's handed back as a function of
 * where that blade starts.
 */
export function demoLines(
  people: DemoPerson[],
  cards: Map<string, CardRect>,
): DemoLines {
  const on = people.filter((p) => cards.has(p.id));
  const card = (id: string) => cards.get(id)!;

  const couples = on
    .filter((p) => p.partner && cards.has(p.partner) && p.id < p.partner)
    .map((p) => {
      const [a, b] = [card(p.id), card(p.partner!)].sort((m, n) => m.x - n.x);
      const y = a.y + a.h / 2;
      return `M ${a.x + a.w},${y} L ${b.x},${y}`;
    });

  const families = new Map<string, DemoPerson[]>();
  for (const p of on) {
    if (!p.parents.length || !p.parents.every((id) => cards.has(id))) continue;
    const key = p.parents.join("+");
    families.set(key, [...(families.get(key) ?? []), p]);
  }
  const branches: DemoLines["branches"] = [];
  for (const kids of families.values()) {
    const rects = kids.map((k) => card(k.id));
    const descent: Descent | null = descentGeometry(
      kids[0].parents.map(card),
      Math.min(...rects.map((r) => r.y)),
      { leafy: true },
    );
    if (!descent) continue;
    const landXs = rects.length > 1 ? rects.map(leafLandX) : [];
    kids.forEach((kid, i) =>
      branches.push({
        child: kid.id,
        path: (bladeTop) =>
          leafBranchPath(descent, rects[i], bladeTop, 10, landXs),
      }),
    );
  }

  const brackets = on
    .filter((p) => p.siblingOf && cards.has(p.siblingOf))
    .map((p) =>
      roundedPolyline(siblingBracketPoints(card(p.id), card(p.siblingOf!)), 10),
    );

  return { couples, branches, brackets };
}
