/**
 * Pure, client-safe auto-layout for the family-tree canvas.
 *
 * The chart is built outward from the *anchors* (the founding admins) in the
 * order the reader cares about:
 *
 *  1. **the anchor couple is the centre.** Their atom is placed at the origin
 *     and everything else is positioned relative to it, so the admins are
 *     always the middle of the picture;
 *  2. **partners sit together.** Spouses are fused into one indivisible
 *     *atom* before any placement happens, so nothing can ever be threaded
 *     between them;
 *  3. **parents sit over their children.** A parent atom is centred on the
 *     span of its children, and an ancestor is placed directly above the
 *     member of the couple whose bloodline it belongs to;
 *  4. **siblings stay together.** A whole family — an atom plus everything
 *     descended from it — is laid out as one rigid *block*, and blocks are
 *     packed against each other by their per-generation contour. Because a
 *     block moves as a unit, no cousin, in-law, or unrelated branch can ever
 *     be dropped into the middle of a set of siblings.
 *
 * Generation fixes `y`: anchors at 0, parents at -1, children at +1, so a rank
 * is always a clean row and adding a great-grandparent extends the chart
 * upward instead of reflowing it.
 *
 * Horizontally, the anchor's descendants are laid out first, then each
 * bloodline is walked *upward*: the ancestors of the anchor's first partner
 * grow leftward, those of the second grow rightward, and each generation's
 * aunts, uncles, and cousins hang off the outer edge of their own parents.
 * In-laws who marry into the tree bring their pyramid with them, placed on
 * their outward side. Every one of those merges is a contour-packed block
 * push, which is what makes overlap impossible at any tree size while leaving
 * each family visually intact.
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
/**
 * A compact "pill" card (Step 19.4): a sibling's partner in a spotlight, named
 * and nothing more. A third of a card's height and a little over half its
 * width, centred on the row so the spouse line to it stays level.
 */
export const PILL_W = 120;
export const PILL_H = 36;

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
  /** Where the trunk may jog sideways to the bus's midpoint, if anywhere. */
  stepY: number | null;
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
  /**
   * People drawn as pills rather than cards (Step 19.4): `PILL_W` × `PILL_H`,
   * packed at that size, and placed on the side of their partner away from
   * the anchors. Empty or absent, the layout is exactly the full-card one.
   */
  compactIds?: ReadonlySet<string>;
  /**
   * Hang each family of two or more children straight under its parents, so
   * the trunk drops onto the middle of the children's bar with no step (the
   * spotlight's pulled-out layout). Leaves are joined at their middles and
   * parents are left between them or at a lone parent's stem, exactly as the
   * canvas draws them. Families are packed centred on those points, `settle`
   * is skipped, and `centreFamilies` makes the result exact. Off, the layout
   * is exactly the overview one.
   */
  centreFamilies?: boolean;
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
  /** Left to right. */
  members: string[];
  generation: number;
  /** Sum of the members' relationship counts. */
  degree: number;
  /** Total width of the members plus the gaps between them. */
  width: number;
  /** Centre x, assigned during coordinate assignment. */
  x: number;
};

const atomWidth = (n: number) => n * NODE_W + (n - 1) * COUPLE_GAP;

/** A person's card size: a pill if they are compact, otherwise a full card. */
type SizeOf = (id: string) => { w: number; h: number };
const FULL_CARD = { w: NODE_W, h: NODE_H };
const PILL = { w: PILL_W, h: PILL_H };

/** Where member `index` starts, measured from the atom's left edge. */
function memberOffset(atom: Atom, index: number, sizeOf: SizeOf): number {
  let offset = 0;
  for (let i = 0; i < index; i++)
    offset += sizeOf(atom.members[i]).w + COUPLE_GAP;
  return offset;
}

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
  const compact = options.compactIds;
  const sizeOf: SizeOf = (id) => (compact?.has(id) ? PILL : FULL_CARD);
  const generations = assignGenerations(people, anchors, {
    childrenOf,
    parentsOf,
    spousesOf,
    degree,
  });
  const atoms = buildAtoms(people, coupleMembers, uf, {
    generations,
    degree,
    byAge,
    sizeOf,
  });
  placeAtoms(atoms, anchors, {
    parentsOf,
    childrenOf,
    byAge,
    sizeOf,
    onLeaves: options.centreFamilies === true,
  });
  const rows = rowsOf(atoms);
  // The spotlight skips it: `settle` squeezes each row of siblings together
  // while their families below stay as wide as ever, pulling every parent off
  // the middle of their children. Straight out of the blocks, each family is
  // already centred on its own brood, which `centreFamilies` then makes exact.
  if (!options.centreFamilies) settle(rows, { parentsOf, childrenOf });
  // Belt and braces: `settle` already ends every row on `separateRow`, so this
  // is a no-op on a well-formed tree and a hard floor on anything else.
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

  // Pills go on the far side of their partner from the anchors (Step 19.4),
  // so a married-in partner never stands between the person and a sibling.
  // Only the order inside the atom changes, never its width or centre, so
  // nothing that packing has already cleared can come to overlap.
  if (compact && compact.size > 0) {
    for (const atom of atoms) {
      const pills = atom.members.filter((m) => compact.has(m));
      if (pills.length === 0 || pills.length === atom.members.length) continue;
      const rest = atom.members.filter((m) => !compact.has(m));
      atom.members = atom.x < 0 ? [...pills, ...rest] : [...rest, ...pills];
    }
  }

  if (options.centreFamilies) {
    centreFamilies(atoms, parentsOf, childrenOf, sizeOf);
    // Keep the chart centred on the anchors, whichever way their family slid.
    const recentre =
      anchorAtoms.length > 0
        ? anchorAtoms.reduce((sum, a) => sum + a.x, 0) / anchorAtoms.length
        : 0;
    for (const atom of atoms) atom.x -= recentre;
  }

  const base = new Map<string, XY>();
  for (const atom of atoms) {
    let x = atom.x - atom.width / 2;
    for (const member of atom.members) {
      const { w, h } = sizeOf(member);
      const y = atom.generation * ROW_H;
      // A pill sits on the row's centre line, where the spouse line runs.
      base.set(member, { x, y: h === NODE_H ? y : y + (NODE_H - h) / 2 });
      x += w + COUPLE_GAP;
    }
  }

  const unions = buildUnions(base, parentsOf, byAge, sizeOf);
  const positions = applyManualPositions(people, base);
  const extent = measure(base);
  const bands = buildBands(people, generations, dob);

  return { positions, autoPositions: base, generations, unions, bands, extent };
}

/**
 * Centre every family of two or more children under its parents' trunk
 * (the spotlight, Phase 2 of the line clean-up). The trunk leaves the parents
 * where `descentGeometry` starts it for leaves, and the children are joined at
 * their middles (`leafLandX`), so once the midpoint of the first and last
 * child sits under the trunk `trunkStep` has nothing to step across.
 *
 * Families are taken top row first and each one's brood — the children's
 * atoms and everything descended from them — slides whole, so a family
 * already centred further down keeps its shape, and the parents and their
 * ancestors never move. A brood that would run into an atom that is not
 * sliding with it (a half-sibling from another union, a cousin's family, a
 * loose sibling) stops a gutter short, and that family keeps a shorter step.
 * One family sliding can clear the way for another taken earlier, so the pass
 * repeats until nothing moves.
 */
function centreFamilies(
  atoms: Atom[],
  parentsOf: Map<string, string[]>,
  childrenOf: Map<string, string[]>,
  sizeOf: SizeOf,
) {
  const atomOf = new Map<string, Atom>();
  for (const atom of atoms) for (const m of atom.members) atomOf.set(m, atom);

  const rectOf = (id: string): CardRect => {
    const atom = atomOf.get(id)!;
    const { w, h } = sizeOf(id);
    const y = atom.generation * ROW_H;
    return {
      x:
        atom.x -
        atom.width / 2 +
        memberOffset(atom, atom.members.indexOf(id), sizeOf),
      y: h === NODE_H ? y : y + (NODE_H - h) / 2,
      w,
      h,
    };
  };

  // One family per parent set, as `buildUnions` groups them.
  const families = new Map<string, { parents: string[]; children: string[] }>();
  for (const [child, parents] of parentsOf) {
    if (!atomOf.has(child)) continue;
    const set = [...new Set(parents)].filter((p) => atomOf.has(p)).sort();
    if (set.length === 0) continue;
    const key = set.join("+");
    const family = families.get(key) ?? { parents: set, children: [] };
    family.children.push(child);
    families.set(key, family);
  }

  const top = (ids: string[]) =>
    Math.min(...ids.map((id) => atomOf.get(id)!.generation));
  const ordered = [...families.entries()]
    .filter(([, f]) => f.children.length >= 2)
    .sort(
      ([lk, l], [rk, r]) =>
        top(l.parents) - top(r.parents) || lk.localeCompare(rk),
    );

  // Each family's brood, and the trunk it hangs from, worked out once: the
  // shape of a brood never changes, only where it sits.
  const plans = ordered.flatMap(([, { parents, children }]) => {
    const parentAtoms = new Set(parents.map((p) => atomOf.get(p)!));
    // The brood: the children's atoms and every atom below them, following
    // children only downward so a data cycle cannot pull the parents in.
    const brood = new Set<Atom>();
    const queue = children.map((c) => atomOf.get(c)!);
    while (queue.length > 0) {
      const atom = queue.pop()!;
      if (brood.has(atom) || parentAtoms.has(atom)) continue;
      brood.add(atom);
      for (const m of atom.members)
        for (const c of childrenOf.get(m) ?? []) {
          const next = atomOf.get(c);
          if (next && next.generation > atom.generation) queue.push(next);
        }
    }
    // A child who is also their own ancestor (bad data) has no brood to slide.
    return [...brood].some((atom) => parentAtoms.has(atom))
      ? []
      : [{ parents, children, brood }];
  });

  for (let pass = 0; pass < 20; pass++) {
    let moved = false;
    for (const { parents, children, brood } of plans) {
      const childRects = children.map(rectOf);
      const trunk = descentGeometry(
        parents.map(rectOf),
        Math.min(...childRects.map((r) => r.y)),
        { leafy: true },
      );
      if (!trunk) continue;
      const landXs = childRects.map(leafLandX);
      const mid = (Math.min(...landXs) + Math.max(...landXs)) / 2;
      let shift = trunk.startX - mid;

      // Clamp against everything on the brood's rows that is staying put.
      for (const moving of brood)
        for (const still of atoms) {
          if (brood.has(still) || still.generation !== moving.generation)
            continue;
          if (shift > 0 && still.x > moving.x)
            shift = Math.min(
              shift,
              Math.max(
                0,
                still.x -
                  still.width / 2 -
                  GUTTER -
                  (moving.x + moving.width / 2),
              ),
            );
          if (shift < 0 && still.x < moving.x)
            shift = Math.max(
              shift,
              Math.min(
                0,
                still.x +
                  still.width / 2 +
                  GUTTER -
                  (moving.x - moving.width / 2),
              ),
            );
        }
      if (Math.abs(shift) < 0.01) continue;
      for (const atom of brood) atom.x += shift;
      moved = true;
    }
    if (!moved) break;
  }
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

/** Group people into couples-or-singletons, one row's worth at a time. */
function buildAtoms(
  people: LayoutPerson[],
  coupleMembers: Map<string, string[]>,
  uf: UnionFind,
  ctx: {
    generations: Map<string, number>;
    degree: Map<string, number>;
    byAge: (a: string, b: string) => number;
    sizeOf: SizeOf;
  },
): Atom[] {
  const { generations, degree, byAge, sizeOf } = ctx;
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
      degree: group.reduce((sum, m) => sum + (degree.get(m) ?? 0), 0),
      // Full cards only: the plain sum, exactly as before pills existed.
      width: group.every((m) => sizeOf(m) === FULL_CARD)
        ? atomWidth(group.length)
        : group.reduce((sum, m) => sum + sizeOf(m).w, 0) +
          (group.length - 1) * COUPLE_GAP,
      x: 0,
    });
  }

  return atoms;
}

/**
 * A rigid group of already-positioned atoms, plus the horizontal extent it
 * occupies on each generation it touches. Blocks are the unit of movement:
 * once a family is inside one, packing can only slide it whole, which is what
 * keeps siblings, couples, and whole branches from being pulled apart.
 */
type Block = {
  atoms: Atom[];
  /** generation -> [leftmost edge, rightmost edge]. */
  extent: Map<number, [number, number]>;
};

const emptyBlock = (): Block => ({ atoms: [], extent: new Map() });

/** A block holding one atom, positioned with its centre on the block origin. */
function atomBlock(atom: Atom): Block {
  atom.x = 0;
  return {
    atoms: [atom],
    extent: new Map([[atom.generation, [-atom.width / 2, atom.width / 2]]]),
  };
}

function shiftBlock(block: Block, dx: number) {
  if (dx === 0) return;
  for (const atom of block.atoms) atom.x += dx;
  for (const [g, [lo, hi]] of block.extent)
    block.extent.set(g, [lo + dx, hi + dx]);
}

/** Fold `other` into `base`, assuming they have already been separated. */
function absorbBlock(base: Block, other: Block) {
  base.atoms.push(...other.atoms);
  for (const [g, [lo, hi]] of other.extent) {
    const current = base.extent.get(g);
    base.extent.set(
      g,
      current ? [Math.min(current[0], lo), Math.max(current[1], hi)] : [lo, hi],
    );
  }
}

/**
 * How far `other` has to travel in `direction` to clear `base` by a gutter on
 * every generation the two share. Zero when they already miss each other, so a
 * block that fits where it wants stays exactly where it was put.
 */
function clearance(base: Block, other: Block, direction: -1 | 1): number {
  let shift = 0;
  for (const [g, [lo, hi]] of other.extent) {
    const against = base.extent.get(g);
    if (!against) continue;
    if (direction === 1) shift = Math.max(shift, against[1] + GUTTER - lo);
    else shift = Math.min(shift, against[0] - GUTTER - hi);
  }
  return shift;
}

/**
 * Place `other` with its origin at `at`, then push it in `direction` until it
 * clears everything already in `base`, and fold it in. This single primitive
 * is the whole placement strategy: every atom, family, and branch is put where
 * it *wants* to be and only displaced outward when it genuinely does not fit.
 */
function mergeBlock(base: Block, other: Block, at: number, direction: -1 | 1) {
  shiftBlock(other, at);
  shiftBlock(other, clearance(base, other, direction));
  absorbBlock(base, other);
}

/** Canvas x of the centre of one member's card within its atom. */
function memberCentre(atom: Atom, index: number, sizeOf: SizeOf) {
  return (
    atom.x -
    atom.width / 2 +
    memberOffset(atom, index, sizeOf) +
    sizeOf(atom.members[index]).w / 2
  );
}

/**
 * An ancestry still to be grown: the parents of `atom.members[index]`, to be
 * planted above that member and expanded away from the centre.
 */
type Ascent = {
  atom: Atom;
  index: number;
  outward: -1 | 1;
  /** True once the branch has committed to a side and must not straddle. */
  committed: boolean;
  seq: number;
};

/**
 * Place every atom. Returns the finished block; each atom's `x` is its centre
 * relative to the block origin (the caller re-centres on the anchors).
 */
function placeAtoms(
  atoms: Atom[],
  anchors: string[],
  ctx: {
    parentsOf: Map<string, string[]>;
    childrenOf: Map<string, string[]>;
    byAge: (a: string, b: string) => number;
    sizeOf: SizeOf;
    /** Centre each family on its children's leaves (see `centreFamilies`). */
    onLeaves?: boolean;
  },
): Block {
  const { parentsOf, childrenOf, byAge, sizeOf, onLeaves } = ctx;

  const atomOf = new Map<string, Atom>();
  for (const atom of atoms) for (const m of atom.members) atomOf.set(m, atom);

  const placed = new Set<Atom>();
  const world = emptyBlock();
  const ascents: Ascent[] = [];
  let sequence = 0;

  /** The atoms one row down that descend from this one, eldest child first. */
  const childAtoms = (atom: Atom) => {
    const born = new Map<Atom, string[]>();
    for (const m of atom.members)
      for (const child of childrenOf.get(m) ?? []) {
        const a = atomOf.get(child);
        if (!a || a.generation !== atom.generation + 1) continue;
        const blood = born.get(a);
        if (blood) {
          if (!blood.includes(child)) blood.push(child);
        } else born.set(a, [child]);
      }
    // Sort on the *blood* child, not on the atom's first member: an atom whose
    // married-in partner happens to be older must still sit by its own birth
    // order among its siblings.
    return [...born.entries()]
      .map(([atom, blood]) => ({ atom, eldest: [...blood].sort(byAge)[0] }))
      .sort((l, r) => byAge(l.eldest, r.eldest));
  };

  /** The atom one row up holding this person's parents. */
  const parentAtom = (member: string) => {
    const found = (parentsOf.get(member) ?? [])
      .map((p) => atomOf.get(p))
      .filter(
        (a): a is Atom =>
          a !== undefined &&
          a.generation === (atomOf.get(member)?.generation ?? 0) - 1,
      );
    // Divorced parents living in separate atoms: follow the better-connected
    // one, so the deeper half of the ancestry is the one drawn in line.
    return found.sort(
      (l, r) => r.degree - l.degree || l.members[0].localeCompare(r.members[0]),
    )[0];
  };

  /**
   * Queue each member's ancestry. A branch keeps growing the way it started
   * (`inherited`), so a whole bloodline stays on its own side of the chart;
   * otherwise an in-law's family grows away from the blood member they married,
   * which is what keeps the two families from interleaving above the couple.
   *
   * Within one direction the innermost member is queued first: whatever is
   * placed first sits nearest the centre, and later ones are pushed out past
   * it, so the ancestry lines fan out instead of crossing.
   */
  const queueAscents = (atom: Atom, inherited: -1 | 1 | null) => {
    const bloodIndex = atom.members.findIndex((m) => {
      const p = parentAtom(m);
      return p !== undefined && placed.has(p);
    });
    const pending: Ascent[] = [];
    atom.members.forEach((_, index) => {
      if (index === bloodIndex) return;
      const outward: -1 | 1 =
        inherited ??
        (bloodIndex === -1
          ? index === 0
            ? -1
            : 1
          : index < bloodIndex
            ? -1
            : 1);
      pending.push({ atom, index, outward, committed: inherited !== null, seq: 0 });
    });
    const rightward = pending
      .filter((a) => a.outward === 1)
      .sort((l, r) => l.index - r.index);
    const leftward = pending
      .filter((a) => a.outward === -1)
      .sort((l, r) => r.index - l.index);
    for (const item of [...rightward, ...leftward])
      ascents.push({ ...item, seq: sequence++ });
  };

  /**
   * An atom and everything descended from it, as one block with the atom's
   * centre on the origin. Children are packed left→right in birth order and
   * the parent is centred on the span they cover.
   */
  const descentBlock = (atom: Atom, inherited: -1 | 1 | null): Block => {
    placed.add(atom);
    const block = atomBlock(atom);
    queueAscents(atom, inherited);

    const kids = childAtoms(atom)
      .map((k) => k.atom)
      .filter((a) => !placed.has(a));
    if (kids.length === 0) return block;

    const brood = emptyBlock();
    for (const kid of kids) mergeBlock(brood, descentBlock(kid, inherited), 0, 1);
    // Centre the parents on the eldest→youngest span rather than on the brood's
    // bounding box, so a child with a big family of their own does not drag the
    // parents off to one side.
    const span = onLeaves
      ? leafSpan(atom, kids) - trunkOffset(atom, kids)
      : (kids[0].x + kids[kids.length - 1].x) / 2;
    shiftBlock(brood, -span);
    // The brood only ever occupies rows below the atom, so it cannot collide.
    absorbBlock(block, brood);
    return block;
  };

  /**
   * The middle of a brood as the spotlight draws it: halfway between the
   * outermost children's own leaves, not their atoms — a child who married
   * sits off the middle of their couple.
   */
  const leafSpan = (atom: Atom, kids: Atom[]) => {
    const xs = kids.flatMap((kid) =>
      kid.members.flatMap((m, i) =>
        (parentsOf.get(m) ?? []).some((p) => atom.members.includes(p))
          ? [memberCentre(kid, i, sizeOf)]
          : [],
      ),
    );
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  };

  /**
   * Where the trunk leaves `atom`, from its centre: between a couple, or at a
   * lone parent's stem. Several unions hang off one atom at different points,
   * so for those the atom's centre is as fair as any.
   */
  const trunkOffset = (atom: Atom, kids: Atom[]) => {
    const sets = new Set<string>();
    for (const kid of kids)
      for (const m of kid.members) {
        const own = (parentsOf.get(m) ?? []).filter((p) =>
          atom.members.includes(p),
        );
        if (own.length > 0) sets.add([...new Set(own)].sort().join("+"));
      }
    if (sets.size !== 1) return 0;
    const parents = [...sets][0].split("+");
    const trunk = descentGeometry(
      parents.map((p) => {
        const i = atom.members.indexOf(p);
        return {
          x: atom.x - atom.width / 2 + memberOffset(atom, i, sizeOf),
          y: 0,
          ...sizeOf(p),
        };
      }),
      ROW_H,
      { leafy: true },
    );
    return trunk ? trunk.startX - atom.x : 0;
  };

  /**
   * Grow one ancestry step: put the parents above the member they belong to,
   * then hang that couple's other children — the aunts and uncles — around
   * them, each with their own descendants in tow.
   */
  const expand = ({ atom, index, outward, committed }: Ascent) => {
    const member = atom.members[index];
    const parents = parentAtom(member);
    if (!parents || placed.has(parents)) return;

    placed.add(parents);
    mergeBlock(
      world,
      atomBlock(parents),
      memberCentre(atom, index, sizeOf),
      outward,
    );
    queueAscents(parents, outward);

    const siblings = childAtoms(parents).filter((s) => !placed.has(s.atom));
    // Aunts and uncles normally all go on the outward side, because the inward
    // side is somebody else's bloodline and nothing may be threaded between the
    // two. The exception is a branch that has not committed to a side yet — an
    // anchor whose partner brought no family of their own — where the inward
    // side is genuinely free, so the siblings straddle their brother or sister
    // and the whole row reads eldest → youngest with the anchor in the middle.
    const twoSided =
      !committed &&
      atom.members.every((m, i) => i === index || parentAtom(m) === undefined);
    const grow = (group: typeof siblings, direction: -1 | 1) => {
      // Nearest in age goes down first, so it lands closest to the spine and
      // the rest fan out past it in birth order.
      const ordered = direction === -1 ? [...group].reverse() : group;
      for (const sibling of ordered)
        mergeBlock(
          world,
          descentBlock(sibling.atom, twoSided ? null : outward),
          parents.x,
          direction,
        );
    };
    if (twoSided) {
      grow(siblings.filter((s) => byAge(s.eldest, member) < 0), -1);
      grow(siblings.filter((s) => byAge(s.eldest, member) >= 0), 1);
    } else {
      grow(siblings, outward);
    }
  };

  // 1. The anchor couple and their descendants: the centre of the chart.
  const anchorAtom =
    atoms.find((a) => a.members.some((m) => anchors.includes(m))) ??
    [...atoms].sort(
      (l, r) =>
        l.generation - r.generation ||
        r.degree - l.degree ||
        l.members[0].localeCompare(r.members[0]),
    )[0];
  if (anchorAtom) absorbBlock(world, descentBlock(anchorAtom, null));

  // 2. Every ancestry, nearest generation first, so the anchors' own parents
  //    claim the space directly above them before an in-law's ever can.
  while (ascents.length > 0) {
    ascents.sort(
      (l, r) =>
        Math.abs(l.atom.generation) - Math.abs(r.atom.generation) ||
        l.seq - r.seq,
    );
    expand(ascents.shift()!);
  }

  // 3. Anything still unplaced is a branch with no path to the anchors. Pack
  //    each one, topmost first, off the right-hand end of the chart.
  for (;;) {
    const orphan = atoms
      .filter((a) => !placed.has(a))
      .sort(
        (l, r) =>
          l.generation - r.generation ||
          r.degree - l.degree ||
          l.members[0].localeCompare(r.members[0]),
      )[0];
    if (!orphan) break;
    mergeBlock(world, descentBlock(orphan, null), 0, 1);
    while (ascents.length > 0) expand(ascents.shift()!);
  }

  return world;
}

/**
 * Nudge each atom towards the centre of the relatives it joins on the rows
 * above and below, then restore the minimum gap.
 *
 * Block packing has already fixed *order*; `separateRow` preserves order, so
 * this pass can only tighten a parent over its brood or a child under its
 * parents. It can never re-shuffle a family, which is exactly why it is safe to
 * run after the structural work rather than instead of it.
 */
function settle(
  rows: Atom[][],
  ctx: {
    parentsOf: Map<string, string[]>;
    childrenOf: Map<string, string[]>;
  },
) {
  const { parentsOf, childrenOf } = ctx;
  const atomOf = new Map<string, Atom>();
  for (const row of rows) for (const a of row) for (const m of a.members) atomOf.set(m, a);

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
    // Odd passes pull children under their parents, even ones pull parents over
    // their children, so neither direction wins outright.
    const direction: -1 | 1 = pass % 2 === 0 ? 1 : -1;
    const order = direction === 1 ? [...rows].reverse() : rows;
    for (const row of order) {
      for (const atom of row) {
        const targets = linked(atom, direction);
        if (targets.length === 0) continue;
        // Centre on the *span* the relatives cover rather than their mean: one
        // child with a large family of their own must not drag the parents off
        // to that side of the brood.
        const xs = targets.map((t) => t.x);
        const want = (Math.min(...xs) + Math.max(...xs)) / 2;
        // Ease in, so one pass cannot whip a row across the canvas.
        atom.x += (want - atom.x) * 0.5;
      }
      separateRow(row);
    }
  }
}

/** The atoms of each generation, ordered left→right, top row first. */
function rowsOf(atoms: Atom[]): Atom[][] {
  const byGeneration = new Map<number, Atom[]>();
  for (const atom of atoms) push(byGeneration, atom.generation, atom);
  return [...byGeneration.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row.sort((l, r) => l.x - r.x));
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
  sizeOf: SizeOf,
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
    const rects = parents.flatMap((p) => {
      const at = base.get(p);
      return at ? [{ x: at.x, y: at.y, ...sizeOf(p) }] : [];
    });
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

/**
 * Follow parent edges from `personId` all the way in one direction: `up` for
 * everyone they descend from, `down` for everyone descended from them. Strict —
 * the person themself is never in the result.
 *
 * The canvas uses this to spotlight a whole bloodline when one of its descent
 * lines is clicked. A cycle in the data (which a mis-entered "parent" edge can
 * create) terminates on the visited set rather than hanging the canvas.
 */
export function bloodline(
  personId: string,
  relationships: LayoutRelationship[],
  direction: "up" | "down",
): Set<string> {
  const next = new Map<string, string[]>();
  for (const r of relationships) {
    if (r.type !== "parent") continue;
    // Walking up follows the edge backwards, child -> parent; walking down
    // follows it the way it is stored.
    if (direction === "up") push(next, r.to_person, r.from_person);
    else push(next, r.from_person, r.to_person);
  }

  const seen = new Set<string>();
  const stack = [...(next.get(personId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(next.get(id) ?? []));
  }
  return seen;
}

/** Everyone `personId` descends from, to the top of the tree. */
export const ancestorsOf = (
  personId: string,
  relationships: LayoutRelationship[],
) => bloodline(personId, relationships, "up");

/** Everyone descended from `personId`, to the bottom of the tree. */
export const descendantsOf = (
  personId: string,
  relationships: LayoutRelationship[],
) => bloodline(personId, relationships, "down");

/** A card's live rectangle on the canvas, as the renderer currently sees it. */
export type CardRect = { x: number; y: number; w: number; h: number };

/**
 * Where a descent line leaves its parents, the bus its siblings share, and the
 * height the trunk jogs at to meet that bus in the middle (`null`: no room).
 */
export type Descent = {
  startX: number;
  startY: number;
  busY: number;
  stepY: number | null;
};

export type DescentOptions = {
  /**
   * The parents are drawn as leaves rather than cards. A leaf's blade fills
   * its box and overhangs it, so there is no clear edge to leave from except
   * the stem.
   */
  leafy?: boolean;
};

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
  options: DescentOptions = {},
): Descent | null {
  if (parents.length === 0) return null;

  const startX =
    parents.reduce((sum, r) => sum + r.x + r.w / 2, 0) / parents.length;
  const bottom = Math.max(...parents.map((r) => r.y + r.h));

  // Normally the line starts on the spouse line, in the gap between partners.
  // If that point would land on top of a card — a lone parent, or partners
  // dragged apart far enough that their midpoint sits over one of them — it
  // has to move off the card, and where to depends on what the card is.
  //
  // A rectangle can be left from underneath: below the bottom edge is empty
  // canvas. A leaf cannot — the blade overhangs the box top and bottom and
  // fills it corner to corner, so a line leaving the bottom sets off through
  // the silhouette. The one strip of a leaf card that is never painted is the
  // one to the left of the stem, so a leaf is left the way it is entered: at
  // the stem root, where the branch it hangs on already reaches.
  const overlapsACard = parents.some((r) => startX > r.x && startX < r.x + r.w);
  const stem = options.leafy
    ? parents.reduce((a, b) => (a.x <= b.x ? a : b))
    : null;
  const startY = overlapsACard
    ? stem
      ? stem.y + stem.h / 2
      : bottom
    : parents.reduce((sum, r) => sum + r.y + r.h / 2, 0) / parents.length;

  // Half a row-gap below the parents puts every sibling on one shared bus.
  // A child dragged up close underneath gets a midpoint bend instead, so the
  // bus never ends up below the child it is feeding.
  const busY =
    childTop > bottom + ROW_GAP ? bottom + ROW_GAP / 2 : (bottom + childTop) / 2;

  return {
    startX: overlapsACard && stem ? stem.x : startX,
    startY,
    busY,
    stepY: stepHeight(bottom, busY),
  };
}

/**
 * The trunk's jog runs a quarter-gap below the parents: clear of the bus at
 * half the gap, and of a spotlight's sibling bracket a quarter-gap above the
 * children's row. Squeezed by a child dragged up close, it sits halfway to the
 * bus instead; with too little room for two rounded corners, there is no jog.
 */
function stepHeight(bottom: number, busY: number): number | null {
  const room = busY - bottom;
  if (room >= ROW_GAP / 2) return bottom + ROW_GAP / 4;
  return room >= MIN_STEP_ROOM ? bottom + room / 2 : null;
}

/** Below this much drop from the parents to the bus, the trunk runs straight. */
const MIN_STEP_ROOM = 8;

/**
 * Past this sideways distance a trunk jogs to its bus's midpoint; within it,
 * the jog would be a smudge, so the trunk drops straight.
 */
const STEP_THRESHOLD = 1;

/**
 * The shared head of every descent line out of one union: down out of the
 * parents, sideways at `stepY` to the midpoint of the siblings' bar, down to
 * the bar, and along it to above `landX`, where this child's line drops off.
 *
 * `landXs` are where *every* sibling in the union drops off the bar — this
 * child included — read from their current cards, so the midpoint follows a
 * drag. Every child of a union computes the same trunk, step and bar from the
 * same inputs, so the faint lines overlap exactly instead of doubling.
 *
 * A lone child, or a trunk already within a pixel of the middle, gets today's
 * single bend at the bus: no jog.
 */
export function descentRoute(
  descent: Descent,
  landX: number,
  landXs: number[],
): XY[] {
  const start = { x: descent.startX, y: descent.startY };
  const land = { x: landX, y: descent.busY };
  const step = trunkStep(descent, landXs);
  if (!step) return [start, { x: start.x, y: descent.busY }, land];
  return [
    start,
    { x: start.x, y: step.y },
    { x: step.midX, y: step.y },
    { x: step.midX, y: descent.busY },
    land,
  ];
}

/** Where the trunk jogs to meet its bar in the middle, or null for no jog. */
export function trunkStep(
  descent: Descent,
  landXs: number[],
): { y: number; midX: number } | null {
  if (landXs.length < 2 || descent.stepY === null) return null;
  // Strictly between the trunk's start and the bus, or it is no step at all.
  if (descent.stepY <= descent.startY || descent.stepY >= descent.busY)
    return null;
  const midX = (Math.min(...landXs) + Math.max(...landXs)) / 2;
  if (Math.abs(midX - descent.startX) < STEP_THRESHOLD) return null;
  return { y: descent.stepY, midX };
}

/** Where a leaf's stem meets the branch it hangs on: the card's left edge. */
export const stemPoint = (card: CardRect): XY => ({
  x: card.x,
  y: card.y + card.h / 2,
});

/**
 * How far to the left of a leaf a sibling bracket drops before turning in
 * along the stem. Half the gap a couple leaves between one blade's tip and
 * the next one's stem root, so the drop lands in the middle of the only clear
 * channel there is — clear of the leaf beside it as well as the one it feeds.
 */
export const STEM_LANE = COUPLE_GAP / 2 + 2;

/**
 * How far short of a leaf a descent line stops. The name sits inside the
 * blade, so a line that reached the outline would read as running into it;
 * this leaves a clear gap above the highest point of the leaf — about 6px
 * once the blade's outline and the line's round cap have taken their share.
 */
export const LEAF_LINE_GAP = 10;

/**
 * The branch from a couple down to one leaf: down out of the parents, along
 * the bus their children share, and straight down over the middle of the leaf
 * — stopping `LEAF_LINE_GAP` above the top of its blade, so it never lands on
 * the blade or the name inside it.
 *
 * `bladeTop` is where this leaf's blade starts, measured down from the top of
 * its card: negative for a shape whose lobes stand above the card box, as a
 * maple's do. A child dragged up so close that its blade reaches the bus gets
 * no drop at all — the line ends on the bus above it rather than climbing.
 */
export function leafBranchPath(
  descent: Descent,
  child: CardRect,
  bladeTop: number,
  radius = 10,
  /** Every sibling's landing on the bus, this one's included: see `descentRoute`. */
  landXs: number[] = [],
): string {
  const x = leafLandX(child);
  const y = Math.max(descent.busY, child.y + bladeTop - LEAF_LINE_GAP);
  return roundedPolyline(
    [...descentRoute(descent, x, landXs), { x, y }],
    radius,
  );
}

/** Where a branch drops off the bus onto a leaf: over the middle of it. */
export const leafLandX = (card: CardRect) => card.x + card.w / 2;

/**
 * How far above a row a sibling bracket runs: a quarter of the row gap, well
 * under the half-gap bus that parents hang their children from, so a bracket
 * can never be read as — or run along — a shared parents' line.
 */
export const BRACKET_RISE = ROW_GAP / 4;

/**
 * The bracket joining two siblings who share no parent on the tree (Step
 * 19.3): a stored "sibling of" row whose parents were never entered. With no
 * parents there is no bus to hang them from, so they get a short one of their
 * own — up out of each leaf's stem lane, across just above the row, and down
 * into the other's, exactly as a real sibling bus arrives.
 */
export function siblingBracketPoints(a: CardRect, b: CardRect): XY[] {
  const [left, right] = a.x <= b.x ? [a, b] : [b, a];
  const y = Math.min(left.y, right.y) - BRACKET_RISE;
  const from = stemPoint(left);
  const to = stemPoint(right);
  return [
    from,
    { x: left.x - STEM_LANE, y: from.y },
    { x: left.x - STEM_LANE, y },
    { x: right.x - STEM_LANE, y },
    { x: right.x - STEM_LANE, y: to.y },
    to,
  ];
}

/**
 * An orthogonal run of points as an SVG path with rounded corners. Duplicate
 * and collinear points are dropped, so a leg that collapses to nothing leaves
 * no stray corner behind.
 */
export function roundedPolyline(points: XY[], radius: number): string {
  const pts: XY[] = [];
  for (const p of points) {
    const last = pts[pts.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    const prev = pts[pts.length - 2];
    // Three in a line: the middle one is not a corner, so drop it.
    if (
      prev &&
      last &&
      ((prev.x === last.x && last.x === p.x) ||
        (prev.y === last.y && last.y === p.y))
    ) {
      pts.pop();
    }
    pts.push(p);
  }
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;

  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const corner = pts[i];
    const before = pts[i - 1];
    const after = pts[i + 1];
    const r = Math.min(
      radius,
      Math.hypot(corner.x - before.x, corner.y - before.y) / 2,
      Math.hypot(corner.x - after.x, corner.y - after.y) / 2,
    );
    const towards = (to: XY) => {
      const len = Math.hypot(to.x - corner.x, to.y - corner.y) || 1;
      return {
        x: corner.x + ((to.x - corner.x) / len) * r,
        y: corner.y + ((to.y - corner.y) / len) * r,
      };
    };
    const inbound = towards(before);
    const outbound = towards(after);
    d += ` L ${inbound.x},${inbound.y} Q ${corner.x},${corner.y} ${outbound.x},${outbound.y}`;
  }
  const end = pts[pts.length - 1];
  return `${d} L ${end.x},${end.y}`;
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

/** A lane title's line, in its own px: `text-xs leading-none` in `family-tree.tsx`. */
export const LANE_TITLE_H = 12;
/** Where the title sits at life size, in canvas units from the lane's top (`top-2`). */
const LANE_TITLE_TOP = 8;
/** Room kept between a magnified title and its row's cards, in the title's own px. */
const LANE_TITLE_CLEAR = 4;
/**
 * As large as the gap between two rows of cards holds. A lane starts halfway
 * across that gap, so a title this size reaches up to the row above's cards
 * and no further.
 */
export const LANE_TITLE_MAX_SCALE = ROW_GAP / (LANE_TITLE_H + LANE_TITLE_CLEAR);

/**
 * A generation lane's title, sized for the zoom (Step 32). The lane is drawn
 * in canvas units, so zoomed out its title shrank with it until it couldn't be
 * read. Below life size it is magnified back to its life size on screen, where
 * it has always sat near the lane's top-left. Where that would run it into its
 * row's cards, it rises into the gap above them, and it never grows past what
 * that gap holds, so it covers no card and no other lane's title. Only a
 * whole-tree view framed below the canvas's own minimum zoom (a wide tree on a
 * phone) has less room than that; there it shrinks with everything else.
 *
 * `scale` magnifies the title about its top-left corner; `top` is in canvas
 * units from the lane's top.
 */
export function laneTitleFit(zoom: number): { scale: number; top: number } {
  const scale =
    Number.isFinite(zoom) && zoom > 0
      ? Math.min(Math.max(1, 1 / zoom), LANE_TITLE_MAX_SCALE)
      : 1;
  // The lane's cards start halfway down the gap between rows.
  const top = Math.min(
    LANE_TITLE_TOP,
    ROW_GAP / 2 - (LANE_TITLE_H + LANE_TITLE_CLEAR) * scale,
  );
  return { scale, top };
}
