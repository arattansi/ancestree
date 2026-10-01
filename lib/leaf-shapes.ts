/**
 * The leaves a spotlight draws (Step 96): one silhouette for each tree in
 * `lib/native-leaf.ts`, drawn from that tree's own leaf — a banyan's broad,
 * blunt fig leaf, a mopane's pair of wings, a date palm's frond, a spruce's
 * shoot of needles.
 *
 * Every blade lies on its side in a 208 × 150 box: the stem comes in from
 * the left along the midrib at y 75 (the card draws it, out to x 46) and the
 * tip points right. A leaf may overhang the box top and bottom, as a maple's
 * lobes do, but never its sides: the next card is only a gutter away.
 *
 * Whatever the species, a blade has to hold the name and the lines under it
 * (`lib/leaf-shapes.test.ts` checks every one): a frond, a sprig of needles
 * or a set of leaflets keeps a solid body along its midrib that the
 * leaflets, needles and lobes stand out from. Their outlines cross inside that body, but the card draws the outline
 * under the fills, so only the silhouette shows.
 *
 * Shapes are built from small parts — an edge mirrored about the midrib,
 * teeth along it, leaflets turned out from a rachis — and measured from what
 * was built: the top a line lands on and the bottom a mark hangs under are
 * read off the outline, never typed in by hand.
 */

type XY = { x: number; y: number };

/** A point on an outline; a `sharp` one is a corner, not curved through. */
type Node = XY & { sharp?: boolean };

/**
 * One edge of a blade, from its base to its tip: `[along, out]`, how far
 * along the midrib and how far out from it, with a third `1` marking a
 * corner — a tooth, a notch, a pointed tip.
 */
type Edge = ReadonlyArray<readonly [number, number, 1?]>;

/** What a shape is drawn with. */
type Drawing = {
  /** Closed outlines, filled as one (nonzero): leaflets overlap freely. */
  blade: string;
  /** Veins, in trunk brown, clipped to the blade. */
  veins: string[];
  /** How strongly the veins show; a busy leaf's are lighter. */
  veinOpacity?: number;
  /** Where the lines start, in card pixels from the left (default 52). */
  textLeft?: number;
};

export type LeafGeometry = Required<Drawing> & {
  /** The top of the blade where a descent line lands on it, at its middle. */
  top: number;
  /** The bottom of the blade under its middle, where the marks hang. */
  bottom: number;
};

/** The midrib every blade lies along. */
export const MIDRIB = 75;

// ---------------------------------------------------------------------------
// Outlines

const dist = (a: XY, b: XY) => Math.hypot(b.x - a.x, b.y - a.y);

/** An edge and its mirror image below the midrib, as one closed outline. */
function mirror(edge: Edge): Node[] {
  const top = edge.map(([x, h, s]) => ({ x, y: -h, sharp: s === 1 }));
  const bottom = top
    .slice(1, -1)
    .reverse()
    .map((p) => ({ ...p, y: -p.y }));
  return [...top, ...bottom];
}

/**
 * A blade whose sides differ — a sickle, a mulberry lobed on one side only:
 * both edges run from the base to the tip, `upper` out above the midrib and
 * `lower` below it, and share their first and last points.
 */
function twoSided(upper: Edge, lower: Edge): Node[] {
  const top = upper.map(([x, h, s]) => ({ x, y: -h, sharp: s === 1 }));
  const bottom = lower
    .slice(1, -1)
    .reverse()
    .map(([x, h, s]) => ({ x, y: h, sharp: s === 1 }));
  return [...top, ...bottom];
}

/**
 * An outline drawn along the x axis, moved to (`x`, `y`) and turned `angle`
 * degrees, clockwise as SVG turns: a leaflet at -50 points up and forward.
 */
function place(nodes: Node[], x: number, y: number, angle = 0): Node[] {
  const r = (angle * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return nodes.map((p) => ({
    x: x + p.x * cos - p.y * sin,
    y: y + p.x * sin + p.y * cos,
    sharp: p.sharp,
  }));
}

type Cubic = [XY, XY, XY, XY];

/**
 * A closed outline as Bézier curves through its points: each point's tangent
 * runs from its neighbour behind to its neighbour ahead, scaled by the
 * distances so that uneven spacing never makes the curve overshoot. A sharp
 * point has no tangent, so the curve turns at it.
 */
function cubics(loop: Node[]): Cubic[] {
  const n = loop.length;
  const tangents = loop.map((p, i) => {
    if (p.sharp) return { x: 0, y: 0 };
    const prev = loop[(i - 1 + n) % n];
    const next = loop[(i + 1) % n];
    const d = dist(prev, p) + dist(p, next);
    return d
      ? { x: (next.x - prev.x) / d, y: (next.y - prev.y) / d }
      : { x: 0, y: 0 };
  });
  return loop.map((p, i) => {
    const j = (i + 1) % n;
    const q = loop[j];
    const third = dist(p, q) / 3;
    return [
      p,
      { x: p.x + tangents[i].x * third, y: p.y + tangents[i].y * third },
      { x: q.x - tangents[j].x * third, y: q.y - tangents[j].y * third },
      q,
    ];
  });
}

const num = (v: number) => String(Math.round(v * 10) / 10);
const pt = (p: XY) => `${num(p.x)},${num(p.y)}`;

/** Closed outlines as one path: straight between corners, curved otherwise. */
function pathOf(loops: Node[][]): string {
  return loops
    .map((loop) => {
      const parts = [`M${pt(loop[0])}`];
      cubics(loop).forEach(([, c1, c2, q], i) => {
        const p = loop[i];
        const next = loop[(i + 1) % loop.length];
        parts.push(
          p.sharp && next.sharp ? `L${pt(q)}` : `C${pt(c1)} ${pt(c2)} ${pt(q)}`,
        );
      });
      return `${parts.join(" ")} Z`;
    })
    .join(" ");
}

const bezier = ([p0, c1, c2, p1]: Cubic, t: number): XY => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
};

// ---------------------------------------------------------------------------
// Margins

type Margin = {
  /** How many teeth along each edge. */
  count: number;
  /**
   * How far a tooth stands out of the blade's outline: a number, or one for
   * each tooth from its place along the run (0 to 1) and its index.
   */
  depth: number | ((t: number, k: number) => number);
  /**
   * How far a tooth's point reaches forward, along the edge towards the tip:
   * needles and a palm's leaflets sweep forward, a birch's teeth barely.
   */
  rake?: number | ((t: number, k: number) => number);
  /** The stretch of the edge, as fractions of its length, the teeth run. */
  from?: number;
  to?: number;
  /**
   * Where a tooth's point sits between the notches either side of it: 0.5
   * is a symmetrical tooth, nearer 1 one that leans towards the tip, as a
   * serrate leaf's do.
   */
  lean?: number;
  /**
   * `serrate` teeth are sharp; `double` ones carry a smaller tooth on their
   * way up, as a birch's do; `crenate` ones are rounded with sharp notches;
   * a `wavy` margin is rounded both ways; a `tuft` is a fan of needles from
   * one point, as a cedar's grow.
   */
  kind?: "serrate" | "double" | "crenate" | "wavy" | "tuft";
  /** How many needles a tuft fans out, and over how many degrees. */
  fan?: [number, number];
};

/**
 * An edge with teeth along it. The edge is first drawn as it would be
 * without them, then walked by length: its own points are kept either side
 * of the teeth, and along them each tooth stands out from the curve at right
 * angles to it (and forward by its rake). Unless they're told otherwise,
 * teeth are a little smaller at either end of their run, as a real margin's
 * are.
 */
function toothed(edge: Edge, m: Margin): Edge {
  const { count, from = 0.1, to = 0.95, lean = 0.7 } = m;
  const kind = m.kind ?? "serrate";
  const depthOf =
    typeof m.depth === "number"
      ? (_: number, k: number) =>
          (m.depth as number) *
          Math.min(1, 0.55 + 0.25 * Math.min(k, count - 1 - k))
      : m.depth;
  const rakeOf =
    typeof m.rake === "function" ? m.rake : () => (m.rake as number) ?? 0;
  const segs = cubics(mirror(edge)).slice(0, edge.length - 1);
  // The edge sampled finely, with the length up to each sample, and the
  // length at which each of its own points falls.
  const samples: { p: XY; s: number }[] = [];
  const nodeAt: number[] = [];
  let s = 0;
  segs.forEach((seg, i) => {
    nodeAt.push(s);
    for (let k = i === 0 ? 0 : 1; k <= 24; k++) {
      const p = bezier(seg, k / 24);
      if (samples.length) s += dist(samples[samples.length - 1].p, p);
      samples.push({ p, s });
    }
  });
  const total = s;
  nodeAt.push(total);
  const at = (len: number) => {
    let i = samples.findIndex((q) => q.s >= len);
    if (i <= 0) i = 1;
    const a = samples[i - 1];
    const b = samples[i];
    const t = b.s > a.s ? (len - a.s) / (b.s - a.s) : 0;
    const p = {
      x: a.p.x + (b.p.x - a.p.x) * t,
      y: a.p.y + (b.p.y - a.p.y) * t,
    };
    const d = dist(a.p, b.p) || 1;
    const along = { x: (b.p.x - a.p.x) / d, y: (b.p.y - a.p.y) / d };
    // Out of the blade: to the left of travel, which runs base to tip.
    const normal = { x: along.y, y: -along.x };
    return { p, normal, along };
  };
  type Point = readonly [number, number, 1?];
  const out = (len: number, by: number, sharp: boolean, forward = 0): Point => {
    const { p, normal, along } = at(len);
    const x = p.x + normal.x * by + along.x * forward;
    const y = p.y + normal.y * by + along.y * forward;
    return sharp ? [x, -y, 1] : [x, -y];
  };

  const start = from * total;
  const end = to * total;
  const period = (end - start) / count;
  const result: Point[] = [edge[0]];
  edge.forEach((node, i) => {
    if (i > 0 && i < edge.length - 1 && nodeAt[i] < start - 2) result.push(node);
  });
  for (let k = 0; k < count; k++) {
    const base = start + k * period;
    const t = count > 1 ? k / (count - 1) : 0;
    const size = depthOf(t, k);
    const forward = rakeOf(t, k);
    result.push(out(base, 0, kind !== "wavy"));
    if (kind === "double") {
      result.push(out(base + period * 0.32, size * 0.45, true));
      result.push(out(base + period * 0.46, size * 0.12, true));
    }
    if (kind === "tuft") {
      // Needles fanning from one point, back to front.
      const [needles, spread] = m.fan ?? [5, 80];
      for (let j = 0; j < needles; j++) {
        const turn = ((j / (needles - 1) - 0.5) * spread * Math.PI) / 180;
        const foot = base + period * (0.3 + (0.3 * j) / (needles - 1));
        const length = size * (1 - Math.abs(j / (needles - 1) - 0.5) * 0.5);
        if (j) result.push(out(foot, 0, true));
        result.push(
          out(foot, length * Math.cos(turn), true, length * Math.sin(turn) + forward),
        );
      }
      continue;
    }
    result.push(
      out(base + period * lean, size, kind === "serrate" || kind === "double", forward),
    );
  }
  result.push(out(end, 0, kind !== "wavy"));
  edge.forEach((node, i) => {
    if (i > 0 && i < edge.length - 1 && nodeAt[i] > end + 2) result.push(node);
  });
  result.push(edge[edge.length - 1]);
  return result;
}

// ---------------------------------------------------------------------------
// Measuring

/** A path as polygons: absolute M, L, C, A and Z, an arc read as a chord. */
export function polygons(d: string): XY[][] {
  const tokens = d.match(/[MLCAZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const result: XY[][] = [];
  let current: XY[] = [];
  let i = 0;
  const read = () => Number(tokens[i++]);
  let command = "";
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) command = tokens[i++].toUpperCase();
    if (command === "Z") {
      if (current.length) result.push(current);
      current = [];
      continue;
    }
    if (command === "M") {
      if (current.length) result.push(current);
      current = [{ x: read(), y: read() }];
      command = "L";
    } else if (command === "L") {
      current.push({ x: read(), y: read() });
    } else if (command === "C") {
      const p0 = current[current.length - 1];
      const seg: Cubic = [
        p0,
        { x: read(), y: read() },
        { x: read(), y: read() },
        { x: read(), y: read() },
      ];
      for (let k = 1; k <= 16; k++) current.push(bezier(seg, k / 16));
    } else if (command === "A") {
      i += 5;
      current.push({ x: read(), y: read() });
    } else {
      throw new Error(`Unsupported path command ${command}`);
    }
  }
  if (current.length) result.push(current);
  return result;
}

/** Whether a point is inside the blade: any outline winding round it. */
export function inside(polys: XY[][], p: XY): boolean {
  let winding = 0;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a.y <= p.y) {
        if (b.y > p.y && cross(a, b, p) > 0) winding++;
      } else if (b.y <= p.y && cross(a, b, p) < 0) winding--;
    }
  }
  return winding !== 0;
}

const cross = (a: XY, b: XY, p: XY) =>
  (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);

/** Where the outline crosses the vertical line at `x`. */
function crossings(polys: XY[][], x: number): number[] {
  const ys: number[] = [];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x)) {
        ys.push(a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y));
      }
    }
  }
  return ys;
}

/** How far a ray from `from` heading along `dir` runs before it leaves the blade. */
function reach(polys: XY[][], from: XY, dir: XY): number {
  let best = Infinity;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const det = dir.x * -ey - dir.y * -ex;
      if (Math.abs(det) < 1e-9) continue;
      const wx = a.x - from.x;
      const wy = a.y - from.y;
      const t = (wx * -ey - wy * -ex) / det;
      const u = (dir.x * wy - dir.y * wx) / det;
      if (t > 1e-6 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
  }
  return Number.isFinite(best) ? best : 0;
}

// ---------------------------------------------------------------------------
// Veins

const line = (a: XY, b: XY) => `M${pt(a)} L${pt(b)}`;

/** The midrib, from just inside the base to short of the tip. */
const midrib = (from: number, to: number) =>
  line({ x: from, y: MIDRIB }, { x: to, y: MIDRIB });

type Laterals = {
  /** Where along the midrib each pair leaves it. */
  at: number[];
  /** Their angle off the midrib, first pair to last. */
  angle: number | [number, number];
  /** How much of the way to the margin they run. */
  reach?: number;
  /** How far they bow back from a straight line, as a share of their length. */
  bow?: number;
};

/**
 * Side veins in pairs off the midrib, each aimed at the margin and stopping
 * short of it, bowed so it leaves the midrib steeply and curves towards the
 * tip — or straight, for the leaves whose veins run straight to their teeth.
 */
function laterals(polys: XY[][], v: Laterals): string[] {
  const { at, reach: share = 0.82, bow = 0.12 } = v;
  const [first, last] = typeof v.angle === "number" ? [v.angle, v.angle] : v.angle;
  return at.flatMap((x, i) => {
    const a =
      ((first + (last - first) * (at.length > 1 ? i / (at.length - 1) : 0)) *
        Math.PI) /
      180;
    return [-1, 1].map((side) => {
      const from = { x, y: MIDRIB };
      const dir = { x: Math.cos(a), y: side * Math.sin(a) };
      const length = reach(polys, from, dir) * share;
      const end = { x: x + dir.x * length, y: MIDRIB + dir.y * length };
      if (!bow) return line(from, end);
      // Away from the midrib and back towards the stem.
      const away =
        side < 0 ? { x: dir.y, y: -dir.x } : { x: -dir.y, y: dir.x };
      const control = {
        x: (from.x + end.x) / 2 + away.x * bow * length,
        y: (from.y + end.y) / 2 + away.y * bow * length,
      };
      return `M${pt(from)} Q${pt(control)} ${pt(end)}`;
    });
  });
}

/** Veins fanning from one point, each most of the way to its target. */
const rays = (from: XY, to: XY[], share = 0.86) =>
  to.map((p) =>
    line(from, {
      x: from.x + (p.x - from.x) * share,
      y: from.y + (p.y - from.y) * share,
    }),
  );

// ---------------------------------------------------------------------------
// Kinds of leaf

/**
 * A simple leaf: one blade from an edge mirrored about the midrib (or two
 * edges), with a midrib and side veins.
 */
function simple(
  outline: Node[],
  veins: Laterals & {
    /** A midrib that doesn't run straight along y 75. */
    midrib?: string;
    extra?: (polys: XY[][]) => string[];
  },
  rest: Omit<Drawing, "blade" | "veins"> = {},
): Drawing {
  const loop = place(outline, 0, MIDRIB);
  const blade = pathOf([loop]);
  const polys = polygons(blade);
  const xs = loop.map((p) => p.x);
  const base = Math.min(...xs.filter((_, i) => Math.abs(loop[i].y - MIDRIB) < 1));
  const tip = Math.max(...xs);
  return {
    blade,
    veins: [
      veins.midrib ?? midrib(base + 2, tip - 8),
      ...laterals(polys, veins),
      ...(veins.extra?.(polys) ?? []),
    ],
    ...rest,
  };
}

/**
 * One leaflet of a compound leaf: a blade of `length` and half-width `width`
 * radiating from (`cx`, `cy`) at `angle` degrees. The baobab's own shape,
 * kept exactly as Step 19 drew it.
 */
function lensLeaflet(
  cx: number,
  cy: number,
  angle: number,
  length: number,
  width: number,
): string {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const at = (along: number, across: number) =>
    `${(cx + along * cos - across * sin).toFixed(1)},${(cy + along * sin + across * cos).toFixed(1)}`;
  return [
    `M${at(0, 0)}`,
    `C${at(length * 0.25, -width)} ${at(length * 0.7, -width * 0.9)} ${at(length, 0)}`,
    `C${at(length * 0.7, width * 0.9)} ${at(length * 0.25, width)} ${at(0, 0)}`,
    "Z",
  ].join(" ");
}

/**
 * A palmately compound leaf: leaflets fanning from the top of the stem, as
 * `[angle, length, width]`, each with its own midrib.
 */
function palmate(
  at: XY,
  leaflets: number[][],
  rest: Omit<Drawing, "blade" | "veins"> = {},
): Drawing {
  return {
    blade: leaflets
      .map(([angle, length, width]) =>
        lensLeaflet(at.x, at.y, angle, length, width),
      )
      .join(" "),
    veins: leaflets.map(([angle, length]) => {
      const rad = (angle * Math.PI) / 180;
      const r = length * 0.85;
      return line(at, {
        x: at.x + r * Math.cos(rad),
        y: at.y + r * Math.sin(rad),
      });
    }),
    veinOpacity: 0.25,
    ...rest,
  };
}

/** A leaflet's outline from `edge`, curved by `bend` along its length. */
function bent(edge: Edge, bend: number): Node[] {
  const length = edge[edge.length - 1][0] || 1;
  return mirror(edge).map((p) => ({
    ...p,
    y: p.y + bend * length * (p.x / length) ** 2,
  }));
}

type Pinna = {
  /** Where on the rachis it grows, and on which side. */
  x: number;
  side: -1 | 1;
  /** Its angle off the rachis, towards the tip. */
  angle: number;
  edge: Edge;
  /** How far its tip curves towards the leaf's tip, as a share of its length. */
  bend?: number;
};

/**
 * A pinnate leaf — leaflets in pairs along a rachis, and maybe one at its
 * end — on a solid `core` along the rachis that keeps the name's band whole.
 * The core is the leaflets' overlap: only where they stand clear of it does
 * the outline show them apart.
 */
function pinnate(
  core: Edge,
  pinnae: Pinna[],
  terminal: { x: number; edge: Edge } | null,
  rest: Omit<Drawing, "blade" | "veins"> & { midribs?: boolean } = {},
): Drawing {
  const { midribs = true, ...drawing } = rest;
  const loops = [place(mirror(core), 0, MIDRIB)];
  const veins: string[] = [];
  const end = terminal
    ? terminal.x
    : Math.max(...pinnae.map((p) => p.x));
  veins.push(midrib(core[0][0] + 2, end));
  for (const p of pinnae) {
    const outline = bent(p.edge, p.side < 0 ? (p.bend ?? 0) : -(p.bend ?? 0));
    const turn = p.side * p.angle;
    loops.push(place(outline, p.x, MIDRIB, turn));
    if (midribs) {
      const length = p.edge[p.edge.length - 1][0];
      const spine = [0, 0.3, 0.55, 0.8].map((t) => ({
        x: length * t,
        y: (p.side < 0 ? 1 : -1) * (p.bend ?? 0) * length * t * t,
      }));
      const placed = place(spine, p.x, MIDRIB, turn);
      veins.push(
        `M${pt(placed[0])} ${placed
          .slice(1)
          .map((q) => `L${pt(q)}`)
          .join(" ")}`,
      );
    }
  }
  if (terminal) {
    loops.push(place(mirror(terminal.edge), terminal.x, MIDRIB));
    const length = terminal.edge[terminal.edge.length - 1][0];
    veins.push(midrib(terminal.x, terminal.x + length * 0.88));
  }
  return { blade: pathOf(loops), veins, veinOpacity: 0.25, ...drawing };
}

/**
 * Pairs of leaflets from `from` to `to` along the rachis, the lower one of
 * each pair `stagger` further on: alternate leaflets have a large stagger,
 * opposite ones none.
 */
function pairs(
  count: number,
  from: number,
  to: number,
  leaflet: (i: number, t: number) => Omit<Pinna, "x" | "side">,
  stagger = 0,
): Pinna[] {
  return Array.from({ length: count }, (_, i) => {
    const t = count > 1 ? i / (count - 1) : 0;
    const x = from + (to - from) * t;
    const shape = leaflet(i, t);
    return [
      { x, side: -1 as const, ...shape },
      { x: x + stagger, side: 1 as const, ...shape },
    ];
  }).flat();
}

/** A leaflet's edge: a lens `length` long, widest `widest` of the way along. */
const leafletEdge = (
  length: number,
  width: number,
  {
    widest = 0.45,
    tip = "acute",
    stalk = false,
  }: { widest?: number; tip?: "acute" | "round"; stalk?: boolean } = {},
): Edge => [
  [0, 0, 1],
  stalk ? [length * 0.1, width * 0.3] : [length * 0.04, width * 0.5],
  [length * widest * 0.5, width * 0.9],
  [length * widest, width],
  [length * (widest + (1 - widest) * 0.5), width * 0.85],
  [length * (widest + (1 - widest) * 0.82), width * 0.45],
  tip === "round" ? [length, 0] : [length, 0, 1],
];

/**
 * A conifer's shoot or a palm's frond: needles or leaflets standing out of a
 * solid core along the twig, packed so closely that nothing of the core's own
 * edge shows between them.
 */
function sprig(core: Edge, margin: Margin, veinOpacity = 0.3): Drawing {
  return {
    blade: pathOf([place(mirror(toothed(core, margin)), 0, MIDRIB)]),
    veins: [midrib(core[0][0] + 2, core[core.length - 1][0] - 8)],
    veinOpacity,
  };
}

// ---------------------------------------------------------------------------
// The leaves

/** The leaf on the Canadian flag (Step 19), on its side; see `maple` below. */
const FLAG_MAPLE =
  "M46.0,72.9 A4.37,4.37 0 0 0 50.5,67.8 L43.6,28.3 L58.3,33.6 A2.99,2.99 0 0 0 61.6,32.7 L96.7,-10.6 L101.2,-0.8 A2.99,2.99 0 0 0 104.9,0.8 L131.2,-7.8 L125.9,17.1 A2.99,2.99 0 0 0 127.7,20.5 L139.0,25.3 L118.1,44.8 A2.99,2.99 0 0 0 120.8,49.9 L169.1,40.5 L160.4,55.5 A2.99,2.99 0 0 0 161.7,59.7 L191.7,75.0 L161.7,90.3 A2.99,2.99 0 0 0 160.4,94.5 L169.1,109.5 L120.8,100.1 A2.99,2.99 0 0 0 118.1,105.2 L139.0,124.7 L127.7,129.5 A2.99,2.99 0 0 0 125.9,132.9 L131.2,157.8 L104.9,149.2 A2.99,2.99 0 0 0 101.2,150.8 L96.7,160.6 L61.6,117.3 A2.99,2.99 0 0 0 58.3,116.4 L43.6,121.7 L50.5,82.2 A4.37,4.37 0 0 0 46.0,77.1 Z";

/** The baobab's hand of leaflets (Step 19), as `[angle, length, width]`. */
const BAOBAB = [
  [0, 178, 26],
  [-20, 152, 24],
  [20, 152, 24],
  [-42, 116, 20],
  [42, 116, 20],
];

/**
 * A palm of lobes fanning from (`cx`, 75): each lobe a toothed blade from the
 * centre out at `[angle, length, width]`, over a round palm that joins them.
 */
function lobed(
  cx: number,
  palm: number,
  lobes: number[][],
  margin: Omit<Margin, "count" | "depth"> & {
    teeth: (length: number) => number;
    depth: number;
    /** Where each lobe is widest, as a share of its length. */
    widest?: number;
  },
  rest: Omit<Drawing, "blade" | "veins"> = {},
): Drawing {
  const loops: Node[][] = [];
  // The palm: a disc where the lobes meet.
  const disc: Node[] = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return { x: cx + palm * Math.cos(a), y: MIDRIB + palm * Math.sin(a) };
  });
  loops.push(disc);
  const tips: XY[] = [];
  for (const [angle, length, width] of lobes) {
    const edge = toothed(
      leafletEdge(length, width, { widest: margin.widest ?? 0.3 }),
      {
        ...margin,
        count: margin.teeth(length),
        depth: margin.depth,
      },
    );
    loops.push(place(mirror(edge), cx, MIDRIB, angle));
    const rad = (angle * Math.PI) / 180;
    tips.push({ x: cx + length * Math.cos(rad), y: MIDRIB + length * Math.sin(rad) });
  }
  return {
    blade: pathOf(loops),
    veins: rays({ x: cx, y: MIDRIB }, tips, 0.84),
    veinOpacity: 0.28,
    ...rest,
  };
}

const SHAPES = {
  /** A leaf from no tree in particular: ovate, pointed, plain. */
  ovate: () =>
    simple(
      mirror([
        [24, 0, 1], [28, 22], [44, 42], [74, 54], [110, 55],
        [146, 47], [178, 30], [196, 13], [206, 0, 1],
      ]),
      { at: [62, 96, 130, 162], angle: [55, 45] },
    ),

  /**
   * Banyan: big, leathery and broad, its tip round and blunt rather than
   * pointed, its base rounded with the faintest notch at the stalk. The
   * veins give it away: a strong pair out from the base, following the
   * margin, then side veins looping forward.
   */
  banyan: () =>
    simple(
      mirror([
        [38, 0, 1], [33, 4], [30, 13], [34, 28], [50, 42], [76, 50],
        [110, 52], [142, 48], [168, 39], [187, 26], [198, 13], [202, 0],
      ]),
      {
        at: [70, 96, 122, 146, 168],
        angle: [56, 46],
        reach: 0.8,
        bow: 0.16,
        extra: (polys) =>
          laterals(polys, { at: [41], angle: 34, reach: 0.8, bow: 0.3 }),
      },
      { veinOpacity: 0.42 },
    ),

  /** Mugumo and umuvumu, strangler figs: elliptic, broadest past the middle, blunt. */
  fig: () =>
    simple(
      mirror([
        [26, 0, 1], [30, 12], [42, 27], [62, 37], [92, 43], [125, 45],
        [156, 42], [180, 33], [196, 19], [202, 0],
      ]),
      { at: [58, 82, 106, 130, 152, 172], angle: [62, 52], bow: 0.14 },
    ),

  /** Sycamore fig: nearly round, with a heart-shaped base and a blunt tip. */
  "sycamore-fig": () =>
    simple(
      mirror([
        [44, 0, 1], [36, 5], [28, 17], [28, 35], [40, 52], [64, 62],
        [96, 64], [128, 60], [156, 50], [178, 36], [192, 19], [198, 0],
      ]),
      {
        at: [88, 118, 146, 170],
        angle: [55, 48],
        bow: 0.14,
        extra: (polys) =>
          laterals(polys, { at: [46], angle: 44, reach: 0.8, bow: 0.18 }),
      },
    ),

  /** Iroko and mvule: elliptic, rounded at the base, a short drip tip, close veins. */
  iroko: () =>
    simple(
      mirror([
        [38, 0, 1], [32, 8], [32, 22], [42, 38], [64, 47], [100, 49],
        [140, 46], [168, 36], [184, 23], [194, 12], [200, 5], [207, 0, 1],
      ]),
      {
        at: [52, 68, 84, 100, 116, 132, 148, 164, 178],
        angle: [62, 52],
        reach: 0.9,
        bow: 0.08,
      },
    ),

  /** Clove: glossy and slim, tapering to both ends, a drawn-out tip. */
  clove: () =>
    simple(
      mirror([
        [24, 0, 1], [30, 11], [44, 26], [64, 33], [96, 36], [130, 35],
        [158, 29], [180, 18], [194, 9], [206, 0, 1],
      ]),
      {
        at: [56, 74, 92, 110, 128, 146, 164],
        angle: [60, 52],
        reach: 0.86,
        bow: 0.06,
      },
      { veinOpacity: 0.3 },
    ),

  /** Ceylon ironwood: narrow and lance-shaped, its tip drawn out long. */
  ironwood: () =>
    simple(
      mirror([
        [26, 0, 1], [30, 10], [40, 22], [58, 29], [90, 31], [124, 30],
        [150, 27], [170, 19], [186, 10], [198, 4], [208, 0, 1],
      ]),
      {
        at: [50, 64, 78, 92, 106, 120, 134, 148, 162],
        angle: 70,
        reach: 0.92,
        bow: 0,
      },
      { veinOpacity: 0.22 },
    ),

  /** Olive: long, narrow and grey-green, tapering evenly to both ends. */
  olive: () =>
    simple(
      mirror([
        [22, 0, 1], [28, 9], [38, 19], [52, 27], [72, 30], [110, 31],
        [140, 29.5], [160, 25], [178, 17], [194, 8], [206, 0, 1],
      ]),
      { at: [70, 104, 138], angle: 32, reach: 0.9, bow: 0.04 },
      { veinOpacity: 0.28 },
    ),

  /** Real yellowwood: a strap, parallel-sided, with a single raised midrib. */
  yellowwood: () =>
    simple(
      mirror([
        [24, 0, 1], [30, 10], [40, 22], [54, 28], [90, 29], [150, 29],
        [172, 27], [188, 20], [200, 10], [208, 0, 1],
      ]),
      { at: [], angle: 0 },
      { veinOpacity: 0.45 },
    ),

  /**
   * Eucalyptus: a sickle — the long tip sweeps up, the lower edge curving
   * round to meet it while the upper one runs on almost straight.
   */
  eucalyptus: () =>
    simple(
      twoSided(
        [
          [24, 0, 1], [30, 10], [44, 23], [60, 28], [90, 30], [130, 30],
          [160, 30], [180, 31], [194, 34], [202, 37], [208, 40, 1],
        ],
        [
          [24, 0, 1], [30, 10], [44, 23], [60, 28], [90, 31], [120, 31.5],
          [142, 29.5], [162, 20], [176, 7], [190, -12], [200, -26],
          [208, -40, 1],
        ],
      ),
      {
        at: [64, 96, 128],
        angle: 34,
        reach: 0.9,
        bow: 0.04,
        midrib: "M26,75 L120,75.5 Q172,75 204,39",
      },
      { veinOpacity: 0.28 },
    ),

  /** Tree rhododendron: leathery, oblong, broadest past the middle, pointed. */
  rhododendron: () =>
    simple(
      mirror([
        [24, 0, 1], [30, 9], [42, 21], [60, 29], [92, 33], [126, 35],
        [154, 34], [176, 28], [192, 18], [201, 8], [207, 0, 1],
      ]),
      {
        at: [58, 78, 98, 118, 138, 158, 176],
        angle: [58, 50],
        bow: 0.1,
      },
      { textLeft: 56 },
    ),

  /** Argan: small and spoon-shaped, narrow at the stalk, round at the tip. */
  argan: () =>
    simple(
      mirror([
        [24, 0, 1], [30, 10], [42, 22], [62, 29], [96, 34], [132, 38],
        [162, 39], [184, 33], [198, 21], [204, 9], [205, 0],
      ]),
      { at: [70, 104, 138, 168], angle: [45, 55], bow: 0.12 },
      { textLeft: 56 },
    ),

  /** Jackfruit and tambalacoque: glossy, broadest past the middle, a short blunt point. */
  obovate: () =>
    simple(
      mirror([
        [24, 0, 1], [30, 11], [42, 25], [62, 36], [96, 45], [132, 50],
        [162, 47], [184, 36], [197, 20], [203, 8], [206, 0, 1],
      ]),
      { at: [56, 80, 104, 128, 152, 174], angle: [58, 50], bow: 0.12 },
    ),

  /** Teak: huge and broad, narrowing into its stalk, rough with strong veins. */
  teak: () =>
    simple(
      mirror([
        [26, 0, 1], [32, 12], [44, 30], [64, 46], [96, 58], [130, 64],
        [160, 60], [182, 47], [196, 28], [203, 12], [207, 0, 1],
      ]),
      {
        at: [50, 72, 94, 116, 138, 160, 180],
        angle: [55, 48],
        reach: 0.86,
        bow: 0.1,
      },
      { veinOpacity: 0.4 },
    ),

  /** Pohutukawa and ivi: thick, oblong and round-ended. */
  oblong: () =>
    simple(
      mirror([
        [30, 0, 1], [30, 14], [38, 30], [56, 39], [90, 42], [140, 42],
        [172, 38], [192, 27], [201, 13], [203, 0],
      ]),
      { at: [56, 84, 112, 140, 166], angle: [60, 52], bow: 0.12 },
    ),

  /** Shea: oblong, wavy at the edge, the tip round and faintly notched. */
  shea: () =>
    simple(
      mirror(
        toothed(
          [
            [26, 0, 1], [30, 12], [42, 26], [64, 34], [100, 37], [150, 37],
            [180, 32], [195, 22], [201, 10], [200, 3], [197, 0, 1],
          ],
          { count: 7, depth: 3, from: 0.16, to: 0.86, lean: 0.5, kind: "wavy" },
        ),
      ),
      {
        at: [48, 60, 72, 84, 96, 108, 120, 132, 144, 156, 168, 180],
        angle: 72,
        reach: 0.92,
        bow: 0,
      },
      { veinOpacity: 0.24 },
    ),

  /**
   * Traveller's tree: a paddle like a banana leaf's, round-ended, its sides
   * torn along the veins.
   */
  "travellers-tree": () => {
    const tear = (x: number, h: number): Edge => [
      [x - 2, h, 1],
      [x - 7, h - 17, 1],
      [x + 1, h, 1],
    ];
    return simple(
      twoSided(
        [
          [30, 0, 1], [30, 20], [36, 38], [52, 47], [64, 49], ...tear(76, 49),
          [94, 49], ...tear(108, 49), [124, 49], ...tear(146, 49), [162, 48],
          ...tear(176, 46), [190, 41], [201, 28], [205, 14], [206, 0],
        ],
        [
          [30, 0, 1], [30, 20], [36, 38], [52, 47], [78, 49], ...tear(92, 49),
          [112, 49], ...tear(128, 49), [146, 49], ...tear(164, 47), [182, 43],
          [194, 36], [201, 26], [205, 13], [206, 0],
        ],
      ),
      {
        at: [40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170],
        angle: 72,
        reach: 0.98,
        bow: 0,
      },
      { veinOpacity: 0.2 },
    );
  },

  /** Wild apple: ovate, finely toothed, a short point. */
  apple: () =>
    simple(
      mirror(
        toothed(
          [
            [26, 0, 1], [29, 14], [40, 32], [62, 44], [96, 48], [130, 45],
            [160, 35], [182, 22], [196, 10], [206, 0, 1],
          ],
          { count: 24, depth: 2.6, from: 0.14, to: 0.95, lean: 0.72 },
        ),
      ),
      { at: [58, 86, 114, 140, 164], angle: [56, 46], bow: 0.12 },
    ),

  /** Zelkova: a pointed oval, one big curved tooth at the end of each straight vein. */
  zelkova: () =>
    simple(
      mirror(
        toothed(
          [
            [26, 0, 1], [29, 12], [40, 28], [60, 38], [92, 42], [124, 39],
            [152, 31], [174, 21], [190, 11], [200, 5], [208, 0, 1],
          ],
          { count: 10, depth: 6, from: 0.16, to: 0.93, lean: 0.85 },
        ),
      ),
      {
        at: [44, 58, 72, 86, 100, 114, 128, 142, 156, 170],
        angle: 46,
        reach: 1,
        bow: 0,
      },
    ),

  /** Sweet chestnut: long, with sharp saw teeth, a straight vein to each. */
  chestnut: () =>
    simple(
      mirror(
        toothed(
          [
            [24, 0, 1], [28, 11], [38, 24], [56, 33], [90, 38], [130, 37],
            [160, 31], [182, 21], [196, 11], [208, 0, 1],
          ],
          { count: 15, depth: 7, from: 0.12, to: 0.95, lean: 0.9 },
        ),
      ),
      {
        at: [36, 46, 56, 66, 76, 86, 96, 106, 116, 126, 136, 146, 156, 166],
        angle: 44,
        reach: 1,
        bow: 0,
      },
    ),

  /** Beech: a pointed oval, wavy-edged, its veins straight and parallel. */
  beech: () =>
    simple(
      mirror(
        toothed(
          [
            [26, 0, 1], [29, 13], [40, 30], [62, 42], [96, 46], [130, 43],
            [158, 34], [180, 22], [196, 10], [206, 0, 1],
          ],
          { count: 7, depth: 3.5, from: 0.16, to: 0.92, lean: 0.62, kind: "crenate" },
        ),
      ),
      {
        at: [46, 66, 86, 106, 126, 146, 166],
        angle: 44,
        reach: 0.96,
        bow: 0,
      },
    ),

  /** Birch: a triangle, broad and square at the base, drawn to a point, doubly toothed. */
  birch: () =>
    simple(
      mirror(
        toothed(
          [
            [38, 0, 1], [38, 20], [42, 40], [52, 54], [62, 60], [72, 60],
            [90, 54], [120, 42], [150, 29], [172, 19], [190, 10], [208, 0, 1],
          ],
          { count: 12, depth: 4.5, from: 0.2, to: 0.95, lean: 0.8, kind: "double" },
        ),
      ),
      { at: [50, 74, 98, 122, 146, 168], angle: [62, 44], reach: 0.94, bow: 0.04 },
    ),

  /**
   * Small-leaved lime: a heart, as wide as it is long, finely toothed, with
   * a short sudden point.
   */
  lime: () =>
    simple(
      mirror(
        toothed(
          [
            [42, 0, 1], [34, 6], [26, 18], [26, 36], [34, 52], [52, 62],
            [80, 66], [110, 63], [140, 54], [164, 40], [180, 26], [190, 15],
            [198, 7], [208, 0, 1],
          ],
          { count: 26, depth: 2.6, from: 0.2, to: 0.95, lean: 0.72 },
        ),
      ),
      {
        at: [96, 126, 154, 176],
        angle: [50, 44],
        bow: 0.12,
        extra: (polys) => [
          ...laterals(polys, { at: [45], angle: 48, reach: 0.82, bow: 0.14 }),
          ...laterals(polys, { at: [45], angle: 100, reach: 0.78, bow: 0.1 }),
        ],
      },
    ),

  /** White mulberry: a heart, coarsely toothed, often lobed on one side. */
  mulberry: () =>
    simple(
      twoSided(
        toothed(
          [
            [42, 0, 1], [34, 6], [27, 18], [28, 36], [38, 52], [58, 61],
            [84, 62], [104, 55], [114, 44], [120, 36], [128, 33], [138, 37],
            [154, 44], [172, 41], [188, 30], [198, 16], [207, 0, 1],
          ],
          { count: 18, depth: 3.5, from: 0.2, to: 0.95, lean: 0.62 },
        ),
        toothed(
          [
            [42, 0, 1], [34, 6], [27, 18], [28, 36], [38, 52], [58, 60],
            [88, 61], [120, 56], [150, 46], [174, 33], [192, 18], [207, 0, 1],
          ],
          { count: 16, depth: 3.5, from: 0.2, to: 0.95, lean: 0.62 },
        ),
      ),
      {
        at: [104, 140, 170],
        angle: [48, 44],
        bow: 0.12,
        extra: (polys) =>
          laterals(polys, { at: [45], angle: 50, reach: 0.82, bow: 0.14 }),
      },
    ),

  /** Holm oak: a small leathery oval, a few spiny teeth. */
  "holm-oak": () =>
    simple(
      mirror(
        toothed(
          [
            [26, 0, 1], [29, 12], [40, 27], [60, 36], [94, 40], [130, 38],
            [160, 31], [182, 20], [196, 10], [206, 0, 1],
          ],
          { count: 5, depth: 6, from: 0.3, to: 0.86, lean: 0.78 },
        ),
      ),
      { at: [60, 88, 116, 144, 168], angle: [55, 48], bow: 0.1 },
    ),

  /**
   * English and sessile oak: round lobes either side of the midrib, ears
   * curling round the stalk, a round lobe at the tip, the two sides out of
   * step.
   */
  oak: () => {
    const upper: Edge = [
      [40, 0, 1], [34, 4], [30, 12], [33, 21], [40, 23], [46, 23], [50, 29],
      [55, 37], [63, 41], [70, 36], [72, 29], [77, 40], [85, 50], [96, 51],
      [101, 42], [102, 33], [108, 46], [117, 57], [130, 57], [135, 46],
      [136, 36], [143, 48], [153, 57], [165, 54], [168, 44], [167, 34],
      [174, 41], [184, 43], [190, 35], [189, 26], [197, 25], [204, 17],
      [207, 7], [207, 0],
    ];
    const lower: Edge = upper.map(([x, h, s], i) =>
      i === 0 || i === upper.length - 1 || x <= 50
        ? ([x, h, s] as const)
        : ([Math.min(x + 5, 207), h * 0.96, s] as const),
    );
    return simple(twoSided(upper, lower), {
      at: [56, 86, 114, 146, 174],
      angle: [62, 50],
      reach: 0.86,
      bow: 0.08,
    });
  },

  /** Northern red oak: lobes cut halfway in, each ending in bristle-tipped points. */
  "red-oak": () =>
    simple(
      mirror([
        [40, 0, 1], [36, 12], [38, 24], [46, 30], [52, 40], [56, 49, 1],
        [60, 44, 1], [66, 53, 1], [70, 46], [70, 36], [74, 30], [82, 33],
        [88, 46], [92, 58, 1], [96, 53, 1], [102, 66, 1], [106, 57],
        [108, 44], [112, 34], [118, 32], [126, 40], [134, 52, 1],
        [138, 47, 1], [146, 60, 1], [148, 50], [148, 38], [154, 31],
        [162, 32], [170, 40, 1], [172, 34, 1], [180, 39, 1], [180, 30],
        [186, 23], [196, 20, 1], [196, 12, 1], [208, 0, 1],
      ]),
      { at: [60, 98, 132, 166], angle: [55, 45], reach: 0.92, bow: 0.04 },
    ),

  /**
   * Sugar maple: the leaf on the Canadian flag, on its side (Step 19) — the
   * flag's own outline, stem trimmed, scaled so its breadth overhangs the
   * box. A sugar maple is wider than it is long; the hand-drawn star read as
   * neither. Its five main veins fan from the stalk to the five lobes.
   */
  maple: () => ({
    blade: FLAG_MAPLE,
    veins: rays(
      { x: 50, y: MIDRIB },
      [
        { x: 191.7, y: 75 },
        { x: 114, y: -9 },
        { x: 114, y: 159 },
        { x: 43.6, y: 28.3 },
        { x: 43.6, y: 121.7 },
      ],
      0.86,
    ),
    veinOpacity: 0.3,
  }),

  /** Oriental plane and chinar: five lobes cut deep, each with a few coarse teeth. */
  plane: () =>
    lobed(
      58,
      28,
      [
        [0, 150, 36],
        [-50, 110, 26],
        [50, 110, 26],
        [-110, 72, 20],
        [110, 72, 20],
      ],
      { teeth: () => 3, depth: 7, from: 0.4, to: 0.9, lean: 0.75 },
    ),

  /** Japanese maple: seven slender lobes, cut nearly to the stalk, finely toothed. */
  "japanese-maple": () =>
    lobed(
      56,
      22,
      [
        [0, 152, 36],
        [-45, 122, 19],
        [45, 122, 19],
        [-88, 86, 16],
        [88, 86, 16],
        [-134, 62, 13],
        [134, 62, 13],
      ],
      {
        teeth: (length) => Math.round(length / 12),
        depth: 2.4,
        from: 0.3,
        to: 0.95,
        lean: 0.75,
        widest: 0.45,
      },
      { textLeft: 58 },
    ),

  /** Baobab (Step 19): a hand of five leaflets from the top of the stalk. */
  baobab: () => palmate({ x: 26, y: MIDRIB }, BAOBAB),

  /** Ceiba: seven narrow leaflets fanning from the top of a long stalk. */
  ceiba: () =>
    palmate({ x: 30, y: MIDRIB }, [
      [0, 176, 32],
      [-17, 158, 19],
      [17, 158, 19],
      [-38, 130, 15],
      [38, 130, 15],
      [-62, 96, 12],
      [62, 96, 12],
    ]),

  /** Ceibo: three leaflets, the end one largest, on a stalk of its own. */
  ceibo: () => {
    const side: Edge = [
      [0, 0, 1], [6, 7], [20, 17], [42, 22], [64, 17], [79, 8], [88, 0, 1],
    ];
    const loops = [
      place(
        mirror([
          [0, 0, 1], [3, 14], [10, 26], [22, 31], [40, 38], [64, 45],
          [92, 42], [118, 30], [140, 15], [156, 0, 1],
        ]),
        46,
        MIDRIB,
      ),
      place(mirror(side), 44, MIDRIB, -74),
      place(mirror(side), 44, MIDRIB, 74),
    ];
    const tips = [-74, 74].map((a) => place([{ x: 88, y: 0 }], 44, MIDRIB, a)[0]);
    return {
      blade: pathOf(loops),
      veins: [midrib(40, 194), ...rays({ x: 44, y: MIDRIB }, tips, 0.86)],
      veinOpacity: 0.3,
      textLeft: 58,
    };
  },

  /**
   * Mopane: two wings from one stalk, like a butterfly's — their inner edges
   * meeting along the middle and parting only at the end.
   */
  mopane: () => ({
    blade: pathOf([
      place(
        mirror([
          [36, 0, 1], [40, 12], [52, 27], [76, 43], [108, 54], [140, 61],
          [166, 61], [186, 56], [199, 47], [206, 37], [206, 30, 1],
          [196, 20], [186, 10], [179, 0, 1],
        ]),
        0,
        MIDRIB,
      ),
    ]),
    veins: [
      midrib(38, 178),
      ...[-1, 1].flatMap((side) =>
        [
          { x: 204, y: 27 },
          { x: 180, y: 54 },
          { x: 136, y: 58 },
        ].map(
          ({ x, y }) =>
            `M38,75 Q${num((38 + x) / 2)},${num(MIDRIB + side * y * 0.8)} ${num(38 + (x - 38) * 0.9)},${num(MIDRIB + side * y * 0.86)}`,
        ),
      ),
    ],
    veinOpacity: 0.3,
  }),

  /** Neem: curved, pointed leaflets along a long stalk, one at its end. */
  neem: () =>
    pinnate(
      [[32, 0, 1], [40, 18], [60, 28], [150, 29], [176, 22], [188, 0, 1]],
      pairs(
        4,
        50,
        146,
        (_, t) => ({
          angle: 66 - t * 6,
          bend: 0.2,
          edge: leafletEdge(86 - t * 10, 13, { widest: 0.35 }),
        }),
        10,
      ),
      { x: 164, edge: leafletEdge(40, 12) },
    ),

  /** Caucasian walnut (wingnut): many narrow leaflets, close-set. */
  walnut: () =>
    pinnate(
      [[32, 0, 1], [40, 18], [60, 28], [150, 29], [180, 22], [190, 0, 1]],
      pairs(6, 44, 154, (_, t) => ({
        angle: 70 - t * 10,
        edge: leafletEdge(76 - t * 8, 11, { widest: 0.4 }),
      })),
      { x: 172, edge: leafletEdge(34, 11) },
    ),

  /** African mahogany: a few pairs of large, smooth, oblong leaflets, no end one. */
  mahogany: () =>
    pinnate(
      [[32, 0, 1], [40, 18], [60, 29], [150, 30], [184, 22], [196, 0, 1]],
      [
        ...pairs(3, 50, 130, () => ({
          angle: 60,
          bend: 0.05,
          edge: leafletEdge(88, 18, { widest: 0.5 }),
        })),
        ...pairs(1, 164, 164, () => ({
          angle: 28,
          bend: 0.04,
          edge: leafletEdge(44, 16, { widest: 0.5 }),
        })),
      ],
      null,
    ),

  /** Narra: broad, pointed leaflets set alternately, the largest at the end. */
  narra: () =>
    pinnate(
      [[32, 0, 1], [40, 18], [60, 29], [130, 30], [150, 26], [158, 0, 1]],
      pairs(
        3,
        46,
        118,
        () => ({
          angle: 62,
          edge: leafletEdge(84, 19, { widest: 0.42, stalk: true }),
        }),
        24,
      ),
      { x: 142, edge: leafletEdge(64, 25, { widest: 0.38 }) },
    ),

  /** Msasa: pairs of leaflets growing larger towards the end, which ends in a pair. */
  msasa: () =>
    pinnate(
      [[32, 0, 1], [40, 18], [60, 29], [150, 30], [184, 20], [196, 0, 1]],
      pairs(4, 44, 140, (_, t) => ({
        angle: 66 - t * 30,
        bend: 0.1,
        edge: leafletEdge(64 + t * 12, 12 + t * 6, { widest: 0.42 }),
      })),
      null,
    ),

  /** Frankincense: small, round-ended leaflets, crowded along the stalk. */
  frankincense: () =>
    pinnate(
      [[32, 0, 1], [40, 18], [60, 29], [150, 30], [176, 22], [186, 0, 1]],
      pairs(6, 42, 156, (_, t) => ({
        angle: 72 - t * 12,
        edge: leafletEdge(60 - t * 12, 11, { widest: 0.5, tip: "round" }),
      })),
      { x: 172, edge: leafletEdge(30, 10, { tip: "round" }) },
    ),

  /**
   * Gum arabic acacia and camelthorn: twice compound — pairs of pinnae, each
   * a fine comb of tiny leaflets.
   */
  acacia: () =>
    pinnate(
      [[32, 0, 1], [40, 18], [60, 29], [150, 30], [180, 20], [192, 0, 1]],
      pairs(5, 46, 160, (_, t) => {
        const length = 82 - t * 22;
        return {
          angle: 62 - t * 18,
          edge: toothed(
            [[0, 0, 1], [4, 3], [24, 4], [length - 10, 3], [length, 0, 1]],
            { count: 9, depth: 6, rake: 2.5, from: 0.32, to: 0.98, lean: 0.55 },
          ),
        };
      }),
      null,
      { veinOpacity: 0.22 },
    ),

  /** Rain tree and brazilwood: twice compound, with bigger, lopsided leaflets. */
  "rain-tree": () =>
    pinnate(
      [[32, 0, 1], [40, 18], [60, 29], [150, 30], [184, 20], [196, 0, 1]],
      pairs(3, 50, 150, (_, t) => {
        const length = 90 - t * 20;
        return {
          angle: 58 - t * 16,
          edge: toothed(
            [[0, 0, 1], [5, 4], [length - 8, 4], [length, 0, 1]],
            { count: 6, depth: 10, rake: 5, from: 0.3, to: 0.98, lean: 0.6 },
          ),
        };
      }),
      null,
      { veinOpacity: 0.22 },
    ),

  /** Date palm: a frond of stiff, narrow leaflets sweeping forward, spines at its base. */
  palm: () =>
    sprig(
      [[24, 0, 1], [36, 16], [52, 27], [120, 29], [160, 26], [180, 15], [190, 0, 1]],
      {
        count: 19,
        from: 0.05,
        to: 0.98,
        lean: 0.5,
        // Each leaflet at 38 degrees: short spines at the base, the longest
        // a little past the middle, shortening to the tip.
        depth: (t) => (18 + 54 * Math.sin(Math.PI * t ** 0.8)) * 0.62,
        rake: (t) => (18 + 54 * Math.sin(Math.PI * t ** 0.8)) * 0.79,
      },
    ),

  /** Norway spruce and klinki pine: a shoot bristling with short, stiff needles. */
  spruce: () =>
    sprig(
      [[30, 0, 1], [36, 16], [52, 27], [150, 28], [172, 21], [186, 10], [190, 0]],
      {
        count: 32,
        from: 0.08,
        to: 0.99,
        lean: 0.5,
        depth: (t, k) => (k % 2 ? 18 : 24) * (1 - 0.3 * t),
        rake: (_, k) => (k % 2 ? 10 : 4),
      },
    ),

  /** Scots pine: long needles sweeping forward from the shoot. */
  pine: () =>
    sprig(
      [[30, 0, 1], [36, 16], [52, 27], [146, 28], [168, 21], [182, 11], [186, 0]],
      {
        count: 22,
        from: 0.08,
        to: 0.95,
        lean: 0.5,
        depth: (_, k) => (k % 2 ? 26 : 32),
        rake: (t, k) => (k % 2 ? 30 : 22) * (1 - 0.7 * t),
      },
    ),

  /** Cedar of Lebanon: needles in tufts along the twig, each a little starburst. */
  cedar: () =>
    sprig(
      [[30, 0, 1], [36, 16], [52, 27], [150, 28], [174, 20], [188, 9], [192, 0]],
      {
        count: 5,
        from: 0.08,
        to: 0.95,
        depth: 30,
        rake: 4,
        kind: "tuft",
        fan: [7, 120],
      },
    ),

  /** African juniper: a spray of cord-like branchlets, blunt at their ends. */
  juniper: () =>
    sprig(
      [[30, 0, 1], [36, 16], [52, 27], [150, 28], [172, 21], [186, 10], [190, 0]],
      {
        count: 12,
        from: 0.08,
        to: 0.97,
        lean: 0.5,
        depth: 24,
        rake: 12,
        kind: "crenate",
      },
    ),
} satisfies Record<string, () => Drawing>;

export type LeafShape = keyof typeof SHAPES;

export const LEAF_SHAPES = Object.keys(SHAPES) as LeafShape[];

/**
 * Where a descent line lands on a leaf and where its marks hang: the columns
 * of the blade box, either side of its middle, whose highest and lowest
 * outline points count.
 */
const LANDING = [98, 110];
const MARKS = [76, 128];

const geometries = new Map<LeafShape, LeafGeometry>();

/** A leaf's outline, veins and measurements, drawn on first use. */
export function leafGeometry(shape: LeafShape): LeafGeometry {
  const known = geometries.get(shape);
  if (known) return known;
  const drawing = (SHAPES[shape] ?? SHAPES.ovate)();
  const polys = polygons(drawing.blade);
  // The outline's highest or lowest point between two x: where it crosses
  // each column, and any corner it turns between them.
  const extreme = ([from, to]: number[], pick: (ys: number[]) => number) => {
    const ys: number[] = [];
    for (let x = from; x <= to; x += 1) ys.push(...crossings(polys, x));
    for (const p of polys.flat()) if (p.x >= from && p.x <= to) ys.push(p.y);
    return pick(ys);
  };
  const geometry: LeafGeometry = {
    veinOpacity: 0.35,
    textLeft: 52,
    ...drawing,
    top: extreme(LANDING, (ys) => Math.min(...ys)),
    bottom: extreme(MARKS, (ys) => Math.max(...ys)),
  };
  geometries.set(shape, geometry);
  return geometry;
}
