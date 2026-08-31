/**
 * Pure, client-safe auto-layout for the family-tree canvas.
 *
 * The layout is *anchored and stratified* rather than free-floating:
 *
 *  - every person gets an integer **generation** relative to the anchors (the
 *    founding admins). Anchors sit at generation 0, their parents at -1, their
 *    children at +1. Generation fixes `y`, so a rank is always a clean row and
 *    adding a great-grandparent extends the chart upward instead of reflowing
 *    it;
 *  - the anchor couple is translated to the canvas origin, so the tree grows
 *    outward from the centre in every direction;
 *  - ancestors reachable from only one anchor are pushed to that anchor's
 *    **side** of the origin, so the two bloodlines never interleave;
 *  - within a generation, order is refined by median (barycentre) sweeps to cut
 *    edge crossings, then a final separation sweep *guarantees* a minimum gap
 *    between cards — overlap is impossible at any tree size;
 *  - a person's **degree** (how many relatives they connect to) breaks ties, so
 *    the busiest subtrees sit nearest the centre line and sparse leaves drift
 *    outward.
 *
 * Parent edges are stored `parent -> child`; spouses as an undirected pair. A
 * parent set with children gets a **union point** on the couple's spouse line;
 * the canvas hangs one descent bus off it rather than one line per parent.
 *
 * Everything here is deterministic and side-effect free, so the same tree
 * always lays out the same way and the whole thing is unit-testable.
 */

/** Card size, matching `person-node.tsx` (`w-52`). */
export const NODE_W = 208;
export const NODE_H = 112;
/** Minimum gap between two cards that are not partners. */
export const GUTTER = 48;
/** Partners sit closer together than unrelated neighbours. */
export const COUPLE_GAP = 24;
/** Empty space between one generation's row and the next. */
export const ROW_GAP = 132;
/** Row pitch: one generation to the next, top-left to top-left. */
export const ROW_H = NODE_H + ROW_GAP;

export type LayoutPerson = {
  id: string;
  /** Deprecated absolute pin. Honoured until the card is next dragged. */
  pos_x: number | null;
  pos_y: number | null;
  /** Nudge from the computed position; survives new relatives being added. */
  pos_dx?: number | null;
  pos_dy?: number | null;
  /** `YYYY-MM-DD`; used to order couples / siblings left→right, eldest first. */
  date_of_birth?: string | null;
};

export type LayoutRelationship = {
  from_person: string;
  to_person: string;
  type: string;
};

export type XY = { x: number; y: number };

/**
 * A parent set's descent point: where its children's lines fan out from. The
 * geometry here is the *initial* one — the canvas recomputes it from live card
 * positions (via `descentGeometry`) so the line follows the parents as they are
 * dragged — but both use the same rule, so they agree before anything moves.
 */
export type UnionPoint = {
  id: string;
  /** Where the trunk leaves the parents: on the spouse line for a couple. */
  startX: number;
  startY: number;
  /** The y of the horizontal bus the children hang from. */
  busY: number;
  parents: string[];
  children: string[];
};

/** A generation lane drawn behind the cards. */
export type GenerationBand = {
  generation: number;
  /** Top of the lane, and its height, in canvas units. */
  y: number;
  height: number;
  /** "Grandparents", "Children", … relative to the anchors. */
  label: string;
  /** "b. 1920s" when that generation has enough birth years to be worth it. */
  sublabel: string | null;
  count: number;
};

export type TreeLayout = {
  /** `personId -> top-left canvas position`, offsets and legacy pins applied. */
  positions: Map<string, XY>;
  /** The same positions with no manual layer — what a drag is measured from. */
  autoPositions: Map<string, XY>;
  /** `personId -> generation`, 0 at the anchors, negative for ancestors. */
  generations: Map<string, number>;
  unions: UnionPoint[];
  bands: GenerationBand[];
  /** Horizontal extent of the laid-out cards, for full-width band drawing. */
  extent: { minX: number; maxX: number };
};

export type LayoutOptions = {
  /** People the tree is centred on — the founding admins' own entries. */
  anchorIds?: string[];
};

const FAR_FUTURE = "9999-12-31";

class UnionFind {
  private parent = new Map<string, string>();
  find(a: string): string {
    let p = this.parent.get(a);
    if (p === undefined) {
      this.parent.set(a, a);
      return a;
    }
    while (p !== this.parent.get(p)!) p = this.parent.get(p)!;
    this.parent.set(a, p);
    return p;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

/** An atom is what the layout moves around: a couple, or a lone person. */
type Atom = {
  members: string[];
  generation: number;
  /** -1 left of the origin, +1 right, 0 free to sit anywhere. */
  side: number;
  /** Sum of the members' relationship counts. */
  degree: number;
  /** Total width of the members plus the gaps between them. */
  width: number;
  /** Centre x, assigned during coordinate assignment. */
  x: number;
};

const atomWidth = (n: number) => n * NODE_W + (n - 1) * COUPLE_GAP;

/**
 * Lay the tree out. Returns positions plus the structure the canvas needs to
 * draw generation bands and descent buses.
 */
export function layoutTree(
  people: LayoutPerson[],
  relationships: LayoutRelationship[],
  options: LayoutOptions = {},
): TreeLayout {
  const ids = new Set(people.map((p) => p.id));
  const parentEdges = relationships.filter(
    (r) => r.type === "parent" && ids.has(r.from_person) && ids.has(r.to_person),
  );
  const spouseEdges = relationships.filter(
    (r) => r.type === "spouse" && ids.has(r.from_person) && ids.has(r.to_person),
  );

  const dob = new Map(
    people.map((p) => [p.id, p.date_of_birth || FAR_FUTURE] as const),
  );
  const byAge = (a: string, b: string) => {
    const da = dob.get(a)!;
    const db = dob.get(b)!;
    return da < db ? -1 : da > db ? 1 : a.localeCompare(b);
  };

  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();
  for (const e of parentEdges) {
    push(childrenOf, e.from_person, e.to_person);
    push(parentsOf, e.to_person, e.from_person);
  }
  const spousesOf = new Map<string, string[]>();
  for (const e of spouseEdges) {
    push(spousesOf, e.from_person, e.to_person);
    push(spousesOf, e.to_person, e.from_person);
  }

  const degree = new Map(
    people.map((p) => [
      p.id,
      (childrenOf.get(p.id)?.length ?? 0) +
        (parentsOf.get(p.id)?.length ?? 0) +
        (spousesOf.get(p.id)?.length ?? 0),
    ]),
  );

  // Couples: connected components over spouse edges.
  const uf = new UnionFind();
  for (const p of people) uf.find(p.id);
  for (const e of spouseEdges) uf.union(e.from_person, e.to_person);
  const coupleMembers = new Map<string, string[]>();
  for (const p of people) push(coupleMembers, uf.find(p.id), p.id);

  const anchors = (options.anchorIds ?? []).filter((id) => ids.has(id));
  const generations = assignGenerations(people, anchors, {
    childrenOf,
    parentsOf,
    spousesOf,
    degree,
  });
  const sides = assignSides(anchors, { childrenOf, parentsOf, spousesOf });

  const atoms = buildAtoms(people, coupleMembers, uf, {
    generations,
    sides,
    degree,
    byAge,
  });
  const rows = orderRows(atoms, { parentsOf, childrenOf, byAge });
  assignX(rows, { parentsOf, childrenOf });
  tidySiblings(rows, { parentsOf, byAge });
  separate(rows);

  // Centre the whole chart on the anchor couple (or on generation 0).
  const anchorAtoms = atoms.filter((a) =>
    a.members.some((m) => anchors.includes(m)),
  );
  const centring =
    anchorAtoms.length > 0
      ? anchorAtoms.reduce((sum, a) => sum + a.x, 0) / anchorAtoms.length
      : 0;
  for (const atom of atoms) atom.x -= centring;

  const base = new Map<string, XY>();
  for (const atom of atoms) {
    let x = atom.x - atom.width / 2;
    for (const member of atom.members) {
      base.set(member, { x, y: atom.generation * ROW_H });
      x += NODE_W + COUPLE_GAP;
    }
  }

  const unions = buildUnions(base, parentsOf, byAge);
  const positions = applyManualPositions(people, base);
  const extent = measure(base);
  const bands = buildBands(people, generations, dob);

  return { positions, autoPositions: base, generations, unions, bands, extent };
}

/**
 * Breadth-first generation numbering: a parent is one row above their child, a
 * partner shares a row. Seeded at the anchors so the numbers are *relative to
 * them*, which is what keeps the chart stable as relatives are added.
 *
 * Each disconnected component is seeded separately at its best-connected
 * member, so a not-yet-linked branch still gets sane rows of its own.
 */
function assignGenerations(
  people: LayoutPerson[],
  anchors: string[],
  graph: {
    childrenOf: Map<string, string[]>;
    parentsOf: Map<string, string[]>;
    spousesOf: Map<string, string[]>;
    degree: Map<string, number>;
  },
): Map<string, number> {
  const { childrenOf, parentsOf, spousesOf, degree } = graph;
  const generation = new Map<string, number>();

  const walk = (seeds: string[]) => {
    const queue: string[] = [];
    for (const seed of seeds) {
      if (generation.has(seed)) continue;
      generation.set(seed, 0);
      queue.push(seed);
    }
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      const g = generation.get(id)!;
      const visit = (other: string, delta: number) => {
        if (generation.has(other)) return;
        generation.set(other, g + delta);
        queue.push(other);
      };
      for (const s of spousesOf.get(id) ?? []) visit(s, 0);
      for (const p of parentsOf.get(id) ?? []) visit(p, -1);
      for (const c of childrenOf.get(id) ?? []) visit(c, 1);
    }
  };

  walk(anchors);

  // Remaining components, best-connected member first so the seed is a hub.
  const rest = people
    .filter((p) => !generation.has(p.id))
    .sort(
      (a, b) =>
        (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) ||
        a.id.localeCompare(b.id),
    );
  for (const p of rest) if (!generation.has(p.id)) walk([p.id]);

  return generation;
}

/**
 * Which side of the origin a person belongs on: -1 for the first anchor's
 * bloodline, +1 for the second's, 0 for anyone shared, married in, or descended
 * from the anchors. Ancestors are found by walking up; their other descendants
 * (siblings, aunts, cousins) inherit the side by walking back down, so a whole
 * branch stays on one half of the canvas.
 */
function assignSides(
  anchors: string[],
  graph: {
    childrenOf: Map<string, string[]>;
    parentsOf: Map<string, string[]>;
    spousesOf: Map<string, string[]>;
  },
): Map<string, number> {
  const sides = new Map<string, number>();
  if (anchors.length < 2) return sides;
  const { childrenOf, parentsOf, spousesOf } = graph;

  // Anyone at or below the anchors stays centred — shared descendants must not
  // be dragged onto one parent's side.
  const centred = new Set<string>();
  const down = [...anchors];
  while (down.length) {
    const id = down.pop()!;
    if (centred.has(id)) continue;
    centred.add(id);
    for (const c of childrenOf.get(id) ?? []) down.push(c);
    for (const s of spousesOf.get(id) ?? []) down.push(s);
  }

  // Strict ancestors of each anchor (plus the people they married).
  const ancestorsOf = (anchor: string) => {
    const seen = new Set<string>();
    const stack = [...(parentsOf.get(anchor) ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const p of parentsOf.get(id) ?? []) stack.push(p);
      for (const s of spousesOf.get(id) ?? []) stack.push(s);
    }
    return seen;
  };
  const left = ancestorsOf(anchors[0]);
  const right = ancestorsOf(anchors[1]);

  const claim = (id: string, side: number) => {
    if (centred.has(id) || sides.has(id)) return;
    sides.set(id, side);
  };
  for (const id of left) if (!right.has(id)) claim(id, -1);
  for (const id of right) if (!left.has(id)) claim(id, 1);

  // Collaterals: walk down from each sided ancestor, but never into the
  // centred cone, so siblings and cousins follow their bloodline.
  const seeds = [...sides.entries()];
  for (const [seed, side] of seeds) {
    const stack = [seed];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id) || centred.has(id)) continue;
      seen.add(id);
      claim(id, side);
      for (const c of childrenOf.get(id) ?? []) stack.push(c);
      for (const s of spousesOf.get(id) ?? []) stack.push(s);
    }
  }

  return sides;
}

/** Group people into couples-or-singletons, one row's worth at a time. */
function buildAtoms(
  people: LayoutPerson[],
  coupleMembers: Map<string, string[]>,
  uf: UnionFind,
  ctx: {
    generations: Map<string, number>;
    sides: Map<string, number>;
    degree: Map<string, number>;
    byAge: (a: string, b: string) => number;
  },
): Atom[] {
  const { generations, sides, degree, byAge } = ctx;
  const claimed = new Set<string>();
  const atoms: Atom[] = [];

  for (const person of people) {
    if (claimed.has(person.id)) continue;
    const g = generations.get(person.id) ?? 0;
    // Partners only pair up when they landed on the same row; a partner on a
    // different generation (a data error, or a remarriage across rows) is left
    // as their own atom rather than dragging the row out of shape.
    const members = (coupleMembers.get(uf.find(person.id)) ?? [person.id])
      .filter((m) => !claimed.has(m) && (generations.get(m) ?? 0) === g)
      .sort(byAge);
    const group = members.length > 0 ? members : [person.id];
    for (const m of group) claimed.add(m);

    atoms.push({
      members: group,
      generation: g,
      side: sides.get(group[0]) ?? 0,
      degree: group.reduce((sum, m) => sum + (degree.get(m) ?? 0), 0),
      width: atomWidth(group.length),
      x: 0,
    });
  }

  return atoms;
}

/**
 * Decide each row's left→right order.
 *
 * The seed order is by side (bloodline halves stay apart) then by degree, so
 * the best-connected atoms start nearest the centre line and thin branches
 * start at the edges. Median sweeps then pull each atom towards the atoms it
 * connects to on the row above / below, which is what removes crossings.
 * `side` stays a hard primary key throughout, so a sweep can reorder within a
 * bloodline but never shuffle the two bloodlines together.
 */
function orderRows(
  atoms: Atom[],
  ctx: {
    parentsOf: Map<string, string[]>;
    childrenOf: Map<string, string[]>;
    byAge: (a: string, b: string) => number;
  },
): Atom[][] {
  const { parentsOf, childrenOf } = ctx;

  const atomOf = new Map<string, Atom>();
  for (const atom of atoms) for (const m of atom.members) atomOf.set(m, atom);

  const byGeneration = new Map<number, Atom[]>();
  for (const atom of atoms) push(byGeneration, atom.generation, atom);
  const rows = [...byGeneration.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row);

  // Seed: hubs towards the centre line. On the left half that means descending
  // degree (the hub ends up rightmost, i.e. innermost); on the right, ascending.
  for (const row of rows) {
    row.sort(
      (a, b) =>
        a.side - b.side ||
        (a.side <= 0 ? b.degree - a.degree : a.degree - b.degree) ||
        a.members[0].localeCompare(b.members[0]),
    );
  }

  const neighbours = (atom: Atom, direction: -1 | 1) => {
    const map = direction === -1 ? parentsOf : childrenOf;
    const out = new Set<Atom>();
    for (const m of atom.members)
      for (const other of map.get(m) ?? []) {
        const a = atomOf.get(other);
        if (a && a.generation === atom.generation + direction) out.add(a);
      }
    return [...out];
  };

  const median = (values: number[]) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const sweep = (direction: -1 | 1) => {
    const order = direction === 1 ? rows : [...rows].reverse();
    const rank = new Map<Atom, number>();
    for (const row of order) row.forEach((a, i) => rank.set(a, i));
    for (const row of order) {
      const key = new Map<Atom, number>();
      row.forEach((atom, i) => {
        const m = median(
          neighbours(atom, -direction as -1 | 1)
            .map((n) => rank.get(n))
            .filter((n): n is number => n !== undefined),
        );
        key.set(atom, m ?? i);
      });
      row.sort(
        (a, b) => a.side - b.side || key.get(a)! - key.get(b)! ||
          a.members[0].localeCompare(b.members[0]),
      );
      row.forEach((a, i) => rank.set(a, i));
    }
  };

  for (let pass = 0; pass < 4; pass++) {
    sweep(1);
    sweep(-1);
  }

  return rows;
}

/**
 * Turn each row's order into x coordinates. Atoms are packed left→right at the
 * minimum spacing, then pulled towards the average x of the atoms they connect
 * to on the neighbouring rows — that is what centres parents over their
 * children and children under their parents. `separate` afterwards restores the
 * minimum gap, so this pass can pull freely without risking an overlap.
 */
function assignX(
  rows: Atom[][],
  ctx: {
    parentsOf: Map<string, string[]>;
    childrenOf: Map<string, string[]>;
  },
) {
  const { parentsOf, childrenOf } = ctx;
  const atomOf = new Map<string, Atom>();
  for (const row of rows) for (const a of row) for (const m of a.members) atomOf.set(m, a);

  for (const row of rows) {
    let cursor = 0;
    for (const atom of row) {
      atom.x = cursor + atom.width / 2;
      cursor += atom.width + GUTTER;
    }
    // Rows start centred on zero; the anchor translation refines this later.
    const shift = (cursor - GUTTER) / 2;
    for (const atom of row) atom.x -= shift;
  }

  const linked = (atom: Atom, direction: -1 | 1) => {
    const map = direction === -1 ? parentsOf : childrenOf;
    const out = new Set<Atom>();
    for (const m of atom.members)
      for (const other of map.get(m) ?? []) {
        const a = atomOf.get(other);
        if (a && a.generation === atom.generation + direction) out.add(a);
      }
    return [...out];
  };

  for (let pass = 0; pass < 8; pass++) {
    const order = pass % 2 === 0 ? rows : [...rows].reverse();
    const direction: -1 | 1 = pass % 2 === 0 ? -1 : 1;
    for (const row of order) {
      for (const atom of row) {
        const targets = linked(atom, direction);
        if (targets.length === 0) continue;
        const want = targets.reduce((sum, t) => sum + t.x, 0) / targets.length;
        // Ease towards the target so a single pass cannot whip a whole
        // subtree across the canvas.
        atom.x += (want - atom.x) * 0.5;
      }
      separateRow(row);
    }
  }
}

/**
 * Reorder each maximal run of siblings within a row oldest → youngest. Runs are
 * contiguous, so this only permutes atoms that already sit next to each other:
 * two unrelated couples (say, the two sets of grandparents) are never sorted
 * against one another by age.
 */
function tidySiblings(
  rows: Atom[][],
  ctx: {
    parentsOf: Map<string, string[]>;
    byAge: (a: string, b: string) => number;
  },
) {
  const { parentsOf, byAge } = ctx;
  const parentKey = (atom: Atom) => {
    const parents = new Set(
      atom.members.flatMap((m) => parentsOf.get(m) ?? []),
    );
    return parents.size === 0 ? null : [...parents].sort().join("+");
  };

  for (const row of rows) {
    let start = 0;
    while (start < row.length) {
      const key = parentKey(row[start]);
      let end = start + 1;
      // Siblings share a parent set; an atom with no parents ends the run.
      while (key !== null && end < row.length && parentKey(row[end]) === key)
        end++;
      if (key !== null && end - start > 1) {
        const slots = row.slice(start, end).map((a) => a.x);
        const run = row
          .slice(start, end)
          .sort((a, b) => byAge(a.members[0], b.members[0]));
        run.forEach((atom, i) => {
          atom.x = slots[i];
        });
        row.splice(start, end - start, ...run);
      }
      start = end;
    }
  }
}

/** Left→right then right→left sweep restoring the minimum gap in a row. */
function separateRow(row: Atom[]) {
  for (let i = 1; i < row.length; i++) {
    const min =
      row[i - 1].x + row[i - 1].width / 2 + GUTTER + row[i].width / 2;
    if (row[i].x < min) row[i].x = min;
  }
  for (let i = row.length - 2; i >= 0; i--) {
    const max = row[i + 1].x - row[i + 1].width / 2 - GUTTER - row[i].width / 2;
    if (row[i].x > max) row[i].x = max;
  }
}

/**
 * The readability guarantee: after this runs, no two cards on a row are closer
 * than `GUTTER`, whatever the ordering passes decided. Cards are pushed apart
 * from the middle outwards so the row stays roughly centred on where it was.
 */
function separate(rows: Atom[][]) {
  for (const row of rows) {
    if (row.length < 2) continue;
    const before = row.reduce((sum, a) => sum + a.x, 0) / row.length;
    separateRow(row);
    // A pure right-ward push would drift the row; recentre it on its old mean.
    const after = row.reduce((sum, a) => sum + a.x, 0) / row.length;
    for (const atom of row) atom.x -= after - before;
  }
}

/**
 * One descent point per parent set that has children: centred between the
 * parents, on the horizontal bus midway down to the children's row. The canvas
 * routes every child of that set through it, so a couple with five children
 * shows one trunk and five stubs instead of ten diagonals.
 */
function buildUnions(
  base: Map<string, XY>,
  parentsOf: Map<string, string[]>,
  byAge: (a: string, b: string) => number,
): UnionPoint[] {
  const childrenByParentSet = new Map<string, { parents: string[]; children: string[] }>();
  for (const [child, parents] of parentsOf) {
    const key = [...new Set(parents)].sort().join("+");
    const entry = childrenByParentSet.get(key) ?? {
      parents: [...new Set(parents)],
      children: [],
    };
    entry.children.push(child);
    childrenByParentSet.set(key, entry);
  }

  const unions: UnionPoint[] = [];
  for (const [key, { parents, children }] of childrenByParentSet) {
    const rects = parents
      .map((p) => base.get(p))
      .filter((p): p is XY => p !== undefined)
      .map((p) => ({ x: p.x, y: p.y, w: NODE_W, h: NODE_H }));
    const childTop = Math.min(
      ...children
        .map((c) => base.get(c)?.y)
        .filter((y): y is number => y !== undefined),
    );
    const geometry = descentGeometry(rects, childTop);
    if (!geometry) continue;

    unions.push({
      id: `u:${key}`,
      ...geometry,
      parents,
      children: [...children].sort(byAge),
    });
  }

  return unions;
}

/** A card's live rectangle on the canvas, as the renderer currently sees it. */
export type CardRect = { x: number; y: number; w: number; h: number };

/** Where a descent line leaves its parents, and the bus its siblings share. */
export type Descent = { startX: number; startY: number; busY: number };

/**
 * Where a couple's descent line starts and where it bends, given the parents'
 * *current* rectangles and the child's current top edge.
 *
 * The canvas calls this on every render with live positions, so the trunk
 * follows the parents as they are dragged instead of staying where the initial
 * layout put it. Kept pure and separate from the renderer so the awkward cases
 * — a lone parent, partners dragged apart, a child pulled up under its parents
 * — are unit-testable.
 */
export function descentGeometry(
  parents: CardRect[],
  childTop: number,
): Descent | null {
  if (parents.length === 0) return null;

  const startX =
    parents.reduce((sum, r) => sum + r.x + r.w / 2, 0) / parents.length;
  const bottom = Math.max(...parents.map((r) => r.y + r.h));

  // Normally the line starts on the spouse line, in the gap between partners.
  // If that point would land on top of a card — a lone parent, or partners
  // dragged apart far enough that their midpoint sits over one of them — drop
  // below the cards instead so the line never crosses a face.
  const overlapsACard = parents.some((r) => startX > r.x && startX < r.x + r.w);
  const startY = overlapsACard
    ? bottom
    : parents.reduce((sum, r) => sum + r.y + r.h / 2, 0) / parents.length;

  // Half a row-gap below the parents puts every sibling on one shared bus.
  // A child dragged up close underneath gets a midpoint bend instead, so the
  // bus never ends up below the child it is feeding.
  const busY =
    childTop > bottom + ROW_GAP ? bottom + ROW_GAP / 2 : (bottom + childTop) / 2;

  return { startX, startY, busY };
}

/** A lateral (spouse) line: a horizontal run, or an orthogonal jog. */
export type Lateral = { y: number; jogged: boolean };

/**
 * Where the line between two partners should sit vertically.
 *
 * A lateral connection reads as a connection only when it is level — a line
 * that slopes a few pixels between two cards looks like a mistake rather than a
 * marriage. When both cards' centres agree (the normal case, since every card
 * is the same height) the line is horizontal through those centres. When a
 * partner has been dragged or nudged out of line, the renderer steps around it
 * at right angles instead of drawing a diagonal.
 */
export function lateralGeometry(a: CardRect, b: CardRect): Lateral {
  const centreA = a.y + a.h / 2;
  const centreB = b.y + b.h / 2;
  // Sub-pixel differences come from rounding, not from intent.
  const jogged = Math.abs(centreA - centreB) > 1;
  return { y: (centreA + centreB) / 2, jogged };
}

/**
 * Apply the manual layer on top of the computed positions: a soft offset
 * (`pos_dx` / `pos_dy`) nudges a card and follows the tree as it grows; a
 * legacy absolute pin (`pos_x` / `pos_y`) still wins outright, until the card is
 * next dragged and the canvas rewrites it as an offset.
 */
function applyManualPositions(
  people: LayoutPerson[],
  base: Map<string, XY>,
): Map<string, XY> {
  const positions = new Map<string, XY>();
  for (const person of people) {
    const auto = base.get(person.id) ?? { x: 0, y: 0 };
    if (person.pos_dx != null || person.pos_dy != null) {
      positions.set(person.id, {
        x: auto.x + (person.pos_dx ?? 0),
        y: auto.y + (person.pos_dy ?? 0),
      });
    } else if (person.pos_x !== null && person.pos_y !== null) {
      positions.set(person.id, { x: person.pos_x, y: person.pos_y });
    } else {
      positions.set(person.id, auto);
    }
  }
  return positions;
}

function measure(base: Map<string, XY>) {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const { x } of base.values()) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + NODE_W);
  }
  return Number.isFinite(minX)
    ? { minX, maxX }
    : { minX: 0, maxX: 0 };
}

const NUMBER_WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
];

/** "One", "Two", … falling back to digits once the words get unwieldy. */
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

/**
 * A generation band's label: "Generation Two", not "Grandparents".
 *
 * A row holds a whole cohort, not one relationship — your parents share theirs
 * with their siblings, their siblings' partners, and everyone else born into
 * it — so naming the row after a relationship mislabels every aunt and uncle on
 * it. Numbering the generation is true of everyone in the row.
 *
 * Numbers count *outward from the founders*: ancestors go up (parents are
 * Generation One, grandparents Two) and descendants go down (children are
 * Generation minus One). That is the inverse of the internal generation index,
 * which grows downward with `y`.
 */
export function generationLabel(generation: number): string {
  if (generation === 0) return "Founders' generation";
  const away = -generation;
  return away > 0
    ? `Generation ${numberWord(away)}`
    : `Generation minus ${numberWord(-away)}`;
}

/**
 * "b. 1950s" for a row born in one decade, "b. 1950s–1960s" when it spans more.
 *
 * A generation is a cohort, not a cohort of one age: two sets of parents born a
 * decade apart genuinely share the row, and picking one decade for the label
 * makes half that row look misfiled. `null` when too few birth years are known
 * for a date to mean anything.
 */
function decadeRange(years: number[], rowSize: number): string | null {
  if (years.length < Math.max(2, Math.ceil(rowSize / 2))) return null;
  const decade = (year: number) => Math.floor(year / 10) * 10;
  const first = decade(Math.min(...years));
  const last = decade(Math.max(...years));
  return first === last ? `b. ${first}s` : `b. ${first}s–${last}s`;
}

function buildBands(
  people: LayoutPerson[],
  generations: Map<string, number>,
  dob: Map<string, string>,
): GenerationBand[] {
  const members = new Map<number, string[]>();
  for (const person of people)
    push(members, generations.get(person.id) ?? 0, person.id);

  return [...members.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([generation, group]) => {
      const years = group
        .map((id) => dob.get(id))
        .filter((d): d is string => !!d && d !== FAR_FUTURE)
        .map((d) => Number(d.slice(0, 4)));

      return {
        generation,
        y: generation * ROW_H - ROW_GAP / 2,
        height: NODE_H + ROW_GAP,
        label: generationLabel(generation),
        sublabel: decadeRange(years, group.length),
        count: group.length,
      };
    });
}
