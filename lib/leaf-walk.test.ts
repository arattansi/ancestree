import { describe, expect, it } from "vitest";

import { ghostLayout, shiftOrbit, type GhostFamily } from "@/lib/leaf-ghosts";
import { orbitLayout, type OrbitGroups } from "@/lib/leaf-orbit";
import { placeOf, walkMorphs, walkOffset, type WalkScene } from "@/lib/leaf-walk";

/** An iPhone 15's screen, less the header and the bars. */
const PHONE = { width: 393, height: 650 };

/**
 * A small family: me with my parents (mum, dad), mum's parents (nana,
 * grandad), my wife, my sister, and six children, the first of whom has a
 * son.
 */
const KIDS = ["k1", "k2", "k3", "k4", "k5", "k6"];
const PARENTS: Record<string, string[]> = {
  me: ["mum", "dad"],
  sis: ["mum", "dad"],
  mum: ["nana", "grandad"],
  ...Object.fromEntries(KIDS.map((k) => [k, ["me", "wife"]])),
  gk: ["k1"],
};
const SPOUSES: [string, string][] = [
  ["me", "wife"],
  ["mum", "dad"],
  ["nana", "grandad"],
];

const childrenOf = (id: string) =>
  Object.entries(PARENTS)
    .filter(([, ps]) => ps.includes(id))
    .map(([kid]) => kid);
const family: GhostFamily = { parentsOf: (id) => PARENTS[id] ?? [], childrenOf };

function groupsOf(id: string): OrbitGroups {
  const parents = PARENTS[id] ?? [];
  return {
    parents,
    children: childrenOf(id),
    spouses: SPOUSES.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : [])),
    siblings: [
      ...new Set(parents.flatMap(childrenOf).filter((s) => s !== id)),
    ],
  };
}

/** The scene for `id`, laid out as the phone does. */
function scene(id: string): WalkScene {
  const groups = groupsOf(id);
  const orbit = orbitLayout(PHONE, groups);
  const shown = new Set([id, ...Object.values(groups).flat()]);
  const ghosts = ghostLayout(orbit, PHONE, family, shown);
  return { focusId: id, layout: shiftOrbit(orbit, ghosts.shift), ghosts };
}

/** Where `id` is in `s`, moved by `by`. */
function moved(s: WalkScene, id: string, by: { x: number; y: number }) {
  const at = placeOf(s, id)!;
  return { x: at.x + by.x, y: at.y + by.y };
}

describe("walkOffset", () => {
  it("slides down to a parent, whose pill lands on their leaf", () => {
    const [from, to] = [scene("me"), scene("mum")];
    const by = walkOffset(from, to)!;
    expect(by.y).toBeGreaterThan(0);
    const landed = moved(from, "mum", by);
    const leaf = placeOf(to, "mum")!;
    expect(landed.x).toBeCloseTo(leaf.x);
    expect(landed.y).toBeCloseTo(leaf.y);
  });

  it("starts everyone drawn in both views where they were", () => {
    const [from, to] = [scene("me"), scene("mum")];
    const by = walkOffset(from, to)!;
    const morphs = walkMorphs(from, to, by);
    // Nana was a ghost over mum's pill and is now one of mum's parent pills:
    // she starts at the ghost's place and size.
    expect(from.ghosts!.ghosts.some((g) => g.id === "nana")).toBe(true);
    const nana = morphs.nana;
    const start = moved(from, "nana", by);
    const end = placeOf(to, "nana")!;
    expect(end.x + nana.dx).toBeCloseTo(start.x);
    expect(end.y + nana.dy).toBeCloseTo(start.y);
    expect(nana.scale).toBeCloseTo(from.ghosts!.sizes[0].width / to.layout.pill.width);
    // Mum's leaf starts on her pill, as small as it was.
    expect(morphs.mum.dx).toBeCloseTo(0);
    expect(morphs.mum.dy).toBeCloseTo(0);
    expect(morphs.mum.scale).toBeCloseTo(from.layout.pill.width / to.layout.leaf.width);
    // My leaf becomes one of mum's children's pills at its own size.
    expect(morphs.me.scale).toBe(1);
    // Dad goes from a parent's pill to mum's spouse's; great-grandparents
    // nobody drew come in without one.
    expect(morphs.dad).toBeDefined();
    expect(Object.keys(morphs).every((id) => placeOf(from, id))).toBe(true);
  });

  it("slides up to a child, right to a spouse and left to a sibling", () => {
    const me = scene("me");
    expect(walkOffset(me, scene("k1"))!.y).toBeLessThan(0);
    expect(walkOffset(me, scene("wife"))!.x).toBeGreaterThan(0);
    expect(walkOffset(me, scene("sis"))!.x).toBeLessThan(0);
  });

  it("slides back the way it came between generations, not between spouses", () => {
    const [me, mum] = [scene("me"), scene("mum")];
    expect(Math.sign(walkOffset(mum, me)!.y)).toBe(-Math.sign(walkOffset(me, mum)!.y));
    // My wife's spouse is on her left too: the leaf view reverses its own
    // move on back instead.
    const wife = scene("wife");
    expect(walkOffset(me, wife)!.x).toBeGreaterThan(0);
    expect(walkOffset(wife, me)!.x).toBeGreaterThan(0);
  });

  it("carries the leaf walked from to its pill when the one walked to was behind +n", () => {
    const [me, k6] = [scene("me"), scene("k6")];
    expect(me.layout.pills.some((p) => p.id === "k6")).toBe(false);
    const by = walkOffset(me, k6)!;
    expect(by.y).toBeLessThan(0);
    const landed = moved(me, "me", by);
    const pill = placeOf(k6, "me")!;
    expect(landed.x).toBeCloseTo(pill.x);
    expect(landed.y).toBeCloseTo(pill.y);
  });

  it("reaches a ghost two lines away", () => {
    const [me, nana] = [scene("me"), scene("nana")];
    const by = walkOffset(me, nana)!;
    expect(by.y).toBeGreaterThan(0);
    const landed = moved(me, "nana", by);
    expect(landed.y).toBeCloseTo(placeOf(nana, "nana")!.y);
  });

  it("has no way to go between people neither view draws", () => {
    expect(walkOffset(scene("gk"), scene("sis"))).toBeNull();
  });
});
