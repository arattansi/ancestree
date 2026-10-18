import { describe, expect, it } from "vitest";

import {
  ghostLayout,
  MAX_EACH,
  placeRow,
  shiftOrbit,
  STUB,
  type GhostFamily,
  type GhostLayout,
} from "@/lib/leaf-ghosts";
import { EDGE, orbitLayout, type OrbitGroups, type OrbitLayout } from "@/lib/leaf-orbit";

/** An iPhone 15's screen, less the header and the bars. */
const PHONE = { width: 393, height: 650 };
/** An iPhone SE's. */
const SMALL = { width: 375, height: 470 };

/** A family from parent → children pairs. */
function lineage(pairs: Record<string, string[]>): GhostFamily {
  const parents = new Map<string, string[]>();
  for (const [parent, kids] of Object.entries(pairs))
    for (const kid of kids) parents.set(kid, [...(parents.get(kid) ?? []), parent]);
  return {
    parentsOf: (id) => parents.get(id) ?? [],
    childrenOf: (id) => pairs[id] ?? [],
  };
}

/** The orbit and its ghosts, moved together as the phone draws them. */
function lay(
  frame: { width: number; height: number },
  groups: OrbitGroups,
  family: GhostFamily,
  focus = "me",
  adds?: { parents: boolean; children: boolean },
) {
  const orbit = orbitLayout(frame, groups, adds);
  const ghosts = ghostLayout(orbit, frame, family, shownOf(focus, groups));
  return { orbit, layout: shiftOrbit(orbit, ghosts.shift), ghosts };
}

function shownOf(focus: string, groups: OrbitGroups) {
  return new Set([
    focus,
    ...groups.parents,
    ...groups.children,
    ...groups.spouses,
    ...groups.siblings,
  ]);
}

/** Everyone's box, the leaf's blade and the pills' included. */
function boxes(layout: OrbitLayout, ghosts: GhostLayout) {
  const box = (x: number, y: number, w: number, h: number) => ({
    left: x - w / 2,
    right: x + w / 2,
    top: y - h / 2,
    bottom: y + h / 2,
  });
  return {
    pills: layout.pills.map((p) => box(p.x, p.y, layout.pill.width, layout.pill.height)),
    ghosts: ghosts.ghosts.map((g) => {
      const s = ghosts.sizes[g.depth - 1];
      return box(g.x, g.y, s.width, s.height);
    }),
  };
}

type Box = ReturnType<typeof boxes>["pills"][number];
const overlap = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

function expectTidy(
  layout: OrbitLayout,
  ghosts: GhostLayout,
  frame: { width: number; height: number },
) {
  const { pills, ghosts: gs } = boxes(layout, ghosts);
  for (const b of [...pills, ...gs]) {
    expect(b.left).toBeGreaterThanOrEqual(EDGE - 0.01);
    expect(b.right).toBeLessThanOrEqual(frame.width - EDGE + 0.01);
    expect(b.top).toBeGreaterThanOrEqual(EDGE - 0.01);
    expect(b.bottom).toBeLessThanOrEqual(frame.height - EDGE + 0.01);
  }
  for (const g of gs) for (const p of pills) expect(overlap(g, p)).toBe(false);
  for (let i = 0; i < gs.length; i++)
    for (let j = i + 1; j < gs.length; j++) expect(overlap(gs[i], gs[j])).toBe(false);
  const ids = ghosts.ghosts.map((g) => g.id);
  expect(new Set(ids).size).toBe(ids.length);
}

const at = (ghosts: GhostLayout, id: string) => ghosts.ghosts.find((g) => g.id === id);

// Me, my parents and theirs, two great-grandparents and one more past them;
// my wife, a sister, two children and their children, and one past them.
const FAMILY = lineage({
  mom: ["me", "sis"],
  dad: ["me", "sis"],
  gm1: ["mom"],
  gp1: ["mom"],
  gm2: ["dad"],
  gp2: ["dad"],
  ggp1: ["gp1"],
  ggp2: ["gp2"],
  gggp: ["ggp2"],
  me: ["k1", "k2"],
  wife: ["k1", "k2"],
  k1: ["gk1", "gk2"],
  k2: ["gk3"],
  gk1: ["ggk"],
  wifemom: ["wife"],
  sis: ["niece"],
});
const GROUPS: OrbitGroups = {
  parents: ["dad", "mom"],
  children: ["k1", "k2"],
  spouses: ["wife"],
  siblings: ["sis"],
};

describe("ghostLayout", () => {
  const { layout, ghosts } = lay(PHONE, GROUPS, FAMILY);
  const pill = (id: string) => layout.pills.find((p) => p.id === id)!;

  it("puts grandparents above the parents and grandchildren below the children", () => {
    for (const id of ["gm1", "gp1", "gm2", "gp2"]) {
      const g = at(ghosts, id)!;
      expect(g).toMatchObject({ depth: 1, direction: "up" });
      expect(g.y).toBeLessThan(pill("dad").y);
    }
    for (const id of ["gk1", "gk2", "gk3"]) {
      const g = at(ghosts, id)!;
      expect(g).toMatchObject({ depth: 1, direction: "down" });
      expect(g.y).toBeGreaterThan(pill("k1").y);
    }
    // Each reached through the pill they hang from.
    expect(at(ghosts, "gm2")!.via).toBe("dad");
    expect(at(ghosts, "gp1")!.via).toBe("mom");
    expect(at(ghosts, "gk3")!.via).toBe("k2");
    expectTidy(layout, ghosts, PHONE);
  });

  it("draws the generation past them smaller, reached through the same pill", () => {
    const g = at(ghosts, "ggp2")!;
    expect(g).toMatchObject({ depth: 2, via: "dad" });
    expect(g.y).toBeLessThan(at(ghosts, "gp2")!.y);
    expect(ghosts.sizes[1].width).toBeLessThan(ghosts.sizes[0].width);
    expect(at(ghosts, "ggk")).toMatchObject({ depth: 2, via: "k1" });
  });

  it("says where the tree goes on past the last generation drawn", () => {
    // gggp is three generations up: a line fades out over ggp2 instead.
    expect(at(ghosts, "gggp")).toBeUndefined();
    const over = at(ghosts, "ggp2")!;
    const stub = ghosts.stubs.find((s) => s.from.x === over.x)!;
    expect(stub.to.y).toBe(stub.from.y - STUB);
    // ggp1 has nobody above: no line over them.
    const quiet = at(ghosts, "ggp1")!;
    expect(ghosts.stubs.some((s) => s.from.x === quiet.x)).toBe(false);
  });

  it("only reaches out from the rows", () => {
    // The wife's mother and the sister's child are a walk away, not ghosts.
    expect(at(ghosts, "wifemom")).toBeUndefined();
    expect(at(ghosts, "niece")).toBeUndefined();
    // Nobody on screen is drawn again: the parents' children include me.
    expect(at(ghosts, "me")).toBeUndefined();
  });

  it("gathers each pill's ghosts over it when there's room", () => {
    const over = (id: string, kids: string[]) => {
      const xs = kids.map((k) => at(ghosts, k)!.x);
      return (Math.min(...xs) + Math.max(...xs)) / 2 - pill(id).x;
    };
    // The two families meet in the middle, so each leans out a little.
    expect(Math.abs(over("dad", ["gm2", "gp2"]))).toBeLessThan(layout.pill.width);
    expect(Math.abs(over("mom", ["gm1", "gp1"]))).toBeLessThan(layout.pill.width);
    expect(at(ghosts, "gp2")!.x).toBeLessThan(at(ghosts, "gp1")!.x);
  });

  it("draws someone two lines away through two pills once", () => {
    // Cousins' children: k1 and k2 share a child.
    const family = lineage({ me: ["k1", "k2"], k1: ["shared"], k2: ["shared"] });
    const groups = { ...GROUPS, parents: [], children: ["k1", "k2"] };
    const { ghosts: g } = lay(PHONE, groups, family);
    expect(g.ghosts.filter((x) => x.id === "shared")).toHaveLength(1);
  });

  it("gives way, largest families first, on a crowded row", () => {
    const pairs: Record<string, string[]> = { me: [] };
    const children = ["c1", "c2", "c3", "c4"];
    children.forEach((c, i) => {
      pairs[c] = Array.from({ length: i === 0 ? 9 : 2 }, (_, k) => `${c}-${k}`);
    });
    const groups = { ...GROUPS, children };
    const { layout: l, ghosts: g } = lay(PHONE, groups, lineage(pairs));
    const count = (c: string) =>
      g.ghosts.filter((x) => x.depth === 1 && x.via === c).length;
    for (const c of children) expect(count(c)).toBeGreaterThanOrEqual(1);
    expect(count("c1")).toBeLessThanOrEqual(MAX_EACH);
    // Pills' order kept left to right.
    const firstX = (c: string) =>
      Math.min(...g.ghosts.filter((x) => x.via === c).map((x) => x.x));
    for (let i = 1; i < children.length; i++)
      expect(firstX(children[i])).toBeGreaterThan(firstX(children[i - 1]));
    expectTidy(l, g, PHONE);
  });

  it("leaves a line, not a ghost, where a generation won't fit", () => {
    // A frame barely taller than the orbit: no room above or below.
    const tight = { width: 393, height: 300 };
    const { layout: l, ghosts: g } = lay(tight, GROUPS, FAMILY);
    expect(g.ghosts).toHaveLength(0);
    const dad = l.pills.find((p) => p.id === "dad")!;
    expect(
      g.stubs.some(
        (s) => s.from.x === dad.x && s.from.y === dad.y - l.pill.height / 2 && s.to.y < s.from.y,
      ),
    ).toBe(true);
    expectTidy(l, g, tight);
  });

  it("lets the outermost generations go first on a short screen", () => {
    let previous = 0;
    let oneEach = false;
    for (let height = 300; height <= 700; height += 10) {
      const frame = { width: 393, height };
      const { layout: l, ghosts: g } = lay(frame, GROUPS, FAMILY);
      expectTidy(l, g, frame);
      // A generation is never drawn without the one before it.
      for (const direction of ["up", "down"] as const) {
        const depths = g.ghosts.filter((x) => x.direction === direction).map((x) => x.depth);
        if (depths.includes(2)) expect(depths).toContain(1);
      }
      // A taller screen never shows fewer.
      expect(g.ghosts.length).toBeGreaterThanOrEqual(previous);
      previous = g.ghosts.length;
      const both = (["up", "down"] as const).every((d) =>
        g.ghosts.some((x) => x.depth === 1 && x.direction === d),
      );
      if (both && !g.ghosts.some((x) => x.depth === 2)) {
        oneEach = true;
        // The great-grandparent over gp2 is a line now.
        const gp2 = at(g, "gp2")!;
        expect(g.stubs.some((s) => s.from.x === gp2.x && s.depth === 2)).toBe(true);
      }
    }
    expect(oneEach).toBe(true);
  });

  it("centres the leaf, its pills and the ghosts together", () => {
    const { layout: l, ghosts: g } = lay(PHONE, GROUPS, FAMILY);
    const { pills: p, ghosts: gs } = boxes(l, g);
    const all = [...p, ...gs];
    const top = Math.min(...all.map((b) => b.top));
    const bottom = Math.max(...all.map((b) => b.bottom));
    expect(top).toBeCloseTo(PHONE.height - bottom, 5);
  });

  it("says where the highest thing drawn is, the lines fading out included", () => {
    const { layout: l, ghosts: g } = lay(PHONE, GROUPS, FAMILY);
    const { pills: p, ghosts: gs } = boxes(l, g);
    const tops = [...p, ...gs].map((b) => b.top);
    const stubs = g.stubs.map((s) => Math.min(s.from.y, s.to.y));
    expect(g.top).toBeCloseTo(Math.min(...tops, ...stubs), 5);
  });

  it("moves a leaf with family only above down, so the half below isn't empty", () => {
    const groups = { parents: ["dad", "mom"], children: [], spouses: [], siblings: ["sis"] };
    const { orbit, layout: l, ghosts: g } = lay(PHONE, groups, FAMILY, "me");
    expect(g.shift).toBeGreaterThan(0);
    expect(l.leaf.y).toBe(orbit.leaf.y + g.shift);
    expectTidy(l, g, PHONE);
  });

  it("fits a small phone", () => {
    const { layout: l, ghosts: g } = lay(SMALL, GROUPS, FAMILY);
    expect(g.ghosts.length).toBeGreaterThan(0);
    expectTidy(l, g, SMALL);
  });

  it("counts a pill asking for a first child when it centres", () => {
    const groups = { parents: ["dad", "mom"], children: [], spouses: [], siblings: ["sis"] };
    const adds = { parents: false, children: true };
    const { layout: l, ghosts: g } = lay(PHONE, groups, FAMILY, "me", adds);
    const ask = l.pills.find((p) => p.add)!;
    expect(ask.side).toBe("children");
    const { pills: p, ghosts: gs } = boxes(l, g);
    const all = [...p, ...gs];
    const top = Math.min(...all.map((b) => b.top));
    const bottom = Math.max(...all.map((b) => b.bottom));
    expect(top).toBeCloseTo(PHONE.height - bottom, 5);
    expect(bottom).toBeCloseTo(ask.y + l.pill.height / 2, 5);
    // The leaf sits higher than with nothing below it at all.
    const bare = lay(PHONE, groups, FAMILY, "me");
    expect(l.leaf.y).toBeLessThan(bare.layout.leaf.y);
    expectTidy(l, g, PHONE);
  });

  it("reaches out from relatives, never from a pill asking for one", () => {
    const groups = { parents: [], children: ["k1", "k2"], spouses: ["wife"], siblings: [] };
    const adds = { parents: true, children: false };
    const { layout: l, ghosts: g } = lay(PHONE, groups, FAMILY, "me", adds);
    const ask = l.pills.find((p) => p.add)!;
    expect(ask.side).toBe("parents");
    expect(g.ghosts.every((x) => x.direction === "down")).toBe(true);
    expect(g.stubs.every((s) => s.from.y > ask.y)).toBe(true);
    for (const frame of [PHONE, SMALL]) {
      const t = lay(frame, groups, FAMILY, "me", adds);
      expectTidy(t.layout, t.ghosts, frame);
    }
  });

  it("draws nothing for a leaf with no parents or children", () => {
    const groups = { parents: [], children: [], spouses: ["wife"], siblings: ["sis"] };
    const { orbit, ghosts: g } = lay(PHONE, groups, FAMILY);
    expect(g).toMatchObject({ ghosts: [], lines: [], stubs: [], shift: 0 });
    expect(shiftOrbit(orbit, g.shift)).toBe(orbit);
  });
});

describe("placeRow", () => {
  const W = 60;
  const ends = (xs: number[][]) =>
    xs.flatMap((row) => row.map((x) => [x - W / 2, x + W / 2]));

  it("sits each group over its pill when they don't meet", () => {
    const xs = placeRow([{ at: 100, count: 1 }, { at: 300, count: 1 }], W, 400);
    expect(xs).toEqual([[100], [300]]);
  });

  it("keeps groups apart, in order, inside the edges", () => {
    for (const groups of [
      [{ at: 150, count: 3 }, { at: 200, count: 3 }],
      [{ at: 10, count: 2 }, { at: 20, count: 2 }, { at: 390, count: 2 }],
      [{ at: 200, count: 9 }, { at: 200, count: 9 }],
    ]) {
      const xs = placeRow(groups, W, 400);
      const spans = ends(xs);
      for (const [l, r] of spans) {
        expect(l).toBeGreaterThanOrEqual(EDGE - 0.01);
        expect(r).toBeLessThanOrEqual(400 - EDGE + 0.01);
      }
      for (let i = 1; i < spans.length; i++)
        expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1]);
      for (const row of xs) expect(row.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("lets the last groups go when even one each won't fit", () => {
    const groups = Array.from({ length: 8 }, (_, i) => ({ at: 50 * i, count: 1 }));
    const xs = placeRow(groups, W, 400);
    expect(xs.filter((row) => row.length === 0).length).toBeGreaterThan(0);
    expect(xs[0]).toHaveLength(1);
  });
});
