import { describe, expect, it } from "vitest";

import { COUPLE_GAP, NODE_H, NODE_W, ROW_GAP, ROW_H } from "@/lib/tree-dimensions";
import { layoutTree } from "@/lib/tree-layout";
import {
  centreOn,
  clampOffset,
  fitMap,
  MAP_PILL_H,
  MAP_PILL_W,
  mapAnchors,
  SQUEEZE,
  treeMap,
  type MapInput,
} from "@/lib/tree-map";

const person = (id: string, dob?: string) => ({
  id,
  pos_x: null,
  pos_y: null,
  date_of_birth: dob ?? null,
});
const parent = (from: string, to: string) => ({ from_person: from, to_person: to, type: "parent" });
const spouse = (a: string, b: string, divorced = false) => ({
  from_person: a,
  to_person: b,
  type: "spouse",
  is_divorced: divorced,
});

/**
 * Grandparents (nana, grandad), their two children (mum, uncle), mum's
 * husband (dad, once married to ex), and mum and dad's two (me, sis).
 */
const FAMILY: MapInput = {
  people: [
    person("nana", "1940-01-01"),
    person("grandad", "1938-01-01"),
    person("mum", "1965-01-01"),
    person("uncle", "1968-01-01"),
    person("dad", "1963-01-01"),
    person("ex", "1964-01-01"),
    person("me", "1990-01-01"),
    person("sis", "1992-01-01"),
  ],
  lines: [
    spouse("nana", "grandad"),
    parent("nana", "mum"),
    parent("grandad", "mum"),
    parent("nana", "uncle"),
    parent("grandad", "uncle"),
    spouse("mum", "dad"),
    spouse("dad", "ex", true),
    parent("mum", "me"),
    parent("dad", "me"),
    parent("mum", "sis"),
    parent("dad", "sis"),
  ],
  anchorIds: ["nana"],
  selfId: "me",
};

const PHONE = { width: 393, height: 650 };

describe("treeMap", () => {
  it("seats every pill where the web seats its card, squeezed to a pill", () => {
    const map = treeMap(FAMILY);
    const web = layoutTree([...FAMILY.people], [...FAMILY.lines], {
      anchorIds: mapAnchors(FAMILY),
    });
    expect(map.pills.map((p) => p.id).sort()).toEqual(
      FAMILY.people.map((p) => p.id).sort(),
    );
    for (const pill of map.pills) {
      const slot = web.positions.get(pill.id)!;
      expect(pill.x).toBeCloseTo((slot.x + NODE_W / 2) * SQUEEZE.x);
      expect(pill.y).toBeCloseTo((slot.y + NODE_H / 2) * SQUEEZE.y);
    }
  });

  it("keeps the web's rows: a generation a row apart, a couple side by side", () => {
    const map = treeMap(FAMILY);
    const at = (id: string) => map.pills.find((p) => p.id === id)!;
    expect(at("mum").y - at("nana").y).toBeCloseTo(ROW_H * SQUEEZE.y);
    expect(at("me").y - at("mum").y).toBeCloseTo(ROW_H * SQUEEZE.y);
    expect(at("nana").y).toBe(at("grandad").y);
    expect(at("mum").y).toBe(at("dad").y);
    expect(at("me").y).toBe(at("sis").y);
  });

  it("packs the pills close: the gaps squeezed with the cards (Step 209)", () => {
    const map = treeMap(FAMILY);
    const at = (id: string) => map.pills.find((p) => p.id === id)!;
    // A card is squeezed to exactly a pill.
    expect(NODE_W * SQUEEZE.x).toBeCloseTo(MAP_PILL_W);
    expect(NODE_H * SQUEEZE.y).toBeCloseTo(MAP_PILL_H);
    // Partners a third of a pill's height apart, one generation a little
    // over a pill's height above the next.
    const couple = Math.abs(at("nana").x - at("grandad").x) - MAP_PILL_W;
    expect(couple).toBeCloseTo(COUPLE_GAP * SQUEEZE.x);
    expect(couple).toBeLessThan(MAP_PILL_H / 2);
    const row = at("me").y - at("mum").y - MAP_PILL_H;
    expect(row).toBeCloseTo(ROW_GAP * SQUEEZE.y);
    expect(row).toBeLessThan(MAP_PILL_H * 1.25);
    // Nobody on a row overlaps their neighbour.
    const rows = new Map<number, number[]>();
    for (const p of map.pills) {
      const y = Math.round(p.y);
      rows.set(y, [...(rows.get(y) ?? []), p.x]);
    }
    for (const xs of rows.values()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(
          MAP_PILL_W + COUPLE_GAP * SQUEEZE.x - 0.01,
        );
      }
    }
  });

  it("hangs children off a bar under their parents, down onto each pill", () => {
    const map = treeMap(FAMILY);
    const at = (id: string) => map.pills.find((p) => p.id === id)!;
    const toMe = map.lines.find(
      (l) => l.kind === "descent" && l.points[l.points.length - 1].x === at("me").x,
    )!;
    expect(toMe).toBeDefined();
    const end = toMe.points[toMe.points.length - 1];
    // Onto the top of the pill, over its middle.
    expect(end.y).toBe(at("me").y - MAP_PILL_H / 2);
    // From the couple's line, in the gap between mum and dad, as on the web.
    const start = toMe.points[0];
    expect(start.x).toBeGreaterThan(Math.min(at("mum").x, at("dad").x));
    expect(start.x).toBeLessThan(Math.max(at("mum").x, at("dad").x));
    expect(start.y).toBe(at("mum").y);
    // Both children drop off the same bar.
    const toSis = map.lines.find(
      (l) => l.kind === "descent" && l.points[l.points.length - 1].x === at("sis").x,
    )!;
    const bar = (l: typeof toMe) => l.points[l.points.length - 2].y;
    expect(bar(toSis)).toBe(bar(toMe));
    expect(map.lines.filter((l) => l.kind === "descent")).toHaveLength(4);
  });

  it("joins partners level from pill end to pill end, dashed once divorced", () => {
    const map = treeMap(FAMILY);
    const at = (id: string) => map.pills.find((p) => p.id === id)!;
    const spouses = map.lines.filter((l) => l.kind === "spouse");
    expect(spouses).toHaveLength(3);
    for (const s of spouses) {
      expect(s.points).toHaveLength(2);
      expect(s.points[0].y).toBe(s.points[1].y);
      expect(s.points[1].x - s.points[0].x).toBeGreaterThan(0);
    }
    const dashed = spouses.filter((s) => s.dashed);
    expect(dashed).toHaveLength(1);
    expect(dashed[0].points[0].y).toBe(at("ex").y);
  });

  it("brackets siblings with no parent on the tree", () => {
    const map = treeMap({
      people: [person("a", "1950-01-01"), person("b", "1952-01-01")],
      lines: [{ from_person: "a", to_person: "b", type: "sibling" }],
      anchorIds: [],
      selfId: "a",
    });
    expect(map.pills).toHaveLength(2);
    const brackets = map.lines.filter((l) => l.kind === "bracket");
    expect(brackets).toHaveLength(1);
    expect(brackets[0].points[0].y).toBe(map.pills[0].y - MAP_PILL_H / 2);
  });

  it("bounds every pill and line", () => {
    const map = treeMap(FAMILY);
    for (const p of map.pills) {
      expect(p.x - MAP_PILL_W / 2).toBeGreaterThanOrEqual(map.bounds.minX);
      expect(p.x + MAP_PILL_W / 2).toBeLessThanOrEqual(map.bounds.maxX);
      expect(p.y - MAP_PILL_H / 2).toBeGreaterThanOrEqual(map.bounds.minY);
      expect(p.y + MAP_PILL_H / 2).toBeLessThanOrEqual(map.bounds.maxY);
    }
    for (const l of map.lines)
      for (const pt of l.points) {
        expect(pt.x).toBeGreaterThanOrEqual(map.bounds.minX);
        expect(pt.x).toBeLessThanOrEqual(map.bounds.maxX);
        expect(pt.y).toBeGreaterThanOrEqual(map.bounds.minY);
        expect(pt.y).toBeLessThanOrEqual(map.bounds.maxY);
      }
  });

  it("is empty for nobody", () => {
    expect(treeMap({ people: [], lines: [], anchorIds: [], selfId: null })).toEqual({
      pills: [],
      lines: [],
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    });
  });
});

describe("mapAnchors", () => {
  it("centres on the anchors the member is blood to, as the web does", () => {
    expect(mapAnchors(FAMILY)).toEqual(["nana"]);
    expect(mapAnchors({ ...FAMILY, anchorIds: ["nana", "ex"] })).toEqual(["nana"]);
  });
  it("falls back to every anchor, then the member, then anyone", () => {
    expect(mapAnchors({ ...FAMILY, anchorIds: ["ex"], selfId: "gone" })).toEqual(["ex"]);
    expect(mapAnchors({ ...FAMILY, anchorIds: [] })).toEqual(["me"]);
    expect(mapAnchors({ ...FAMILY, anchorIds: [], selfId: null })).toEqual(["nana"]);
  });
});

describe("the view", () => {
  it("fits the whole tree on the screen, in the middle", () => {
    const map = treeMap(FAMILY);
    const view = fitMap(map, PHONE);
    const w = map.bounds.maxX - map.bounds.minX;
    const h = map.bounds.maxY - map.bounds.minY;
    expect(w * view.zoom).toBeLessThanOrEqual(PHONE.width - 48);
    expect(h * view.zoom).toBeLessThanOrEqual(PHONE.height - 48);
    const left = view.x + map.bounds.minX * view.zoom;
    const right = view.x + map.bounds.maxX * view.zoom;
    expect(left).toBeCloseTo(PHONE.width - right, 6);
  });

  it("never zooms past the bounds given", () => {
    const map = treeMap({ ...FAMILY, people: FAMILY.people.slice(6, 7), lines: [] });
    expect(fitMap(map, PHONE).zoom).toBe(0.9);
    expect(fitMap(map, { width: 10, height: 10 }).zoom).toBe(0.08);
  });

  it("centres on someone", () => {
    const at = centreOn({ x: 100, y: 200 }, 0.5, PHONE);
    expect(at).toEqual({ x: PHONE.width / 2 - 50, y: PHONE.height / 2 - 100 });
  });

  it("keeps some of the tree on the screen however far it is dragged", () => {
    const map = treeMap(FAMILY);
    const z = 0.5;
    const far = clampOffset({ x: 1e6, y: 1e6 }, map, z, PHONE);
    expect(far.x + map.bounds.minX * z).toBe(PHONE.width - 80);
    expect(far.y + map.bounds.minY * z).toBe(PHONE.height - 80);
    const away = clampOffset({ x: -1e6, y: -1e6 }, map, z, PHONE);
    expect(away.x + map.bounds.maxX * z).toBe(80);
    expect(away.y + map.bounds.maxY * z).toBe(80);
    const home = { x: 20, y: 30 };
    expect(clampOffset(home, map, z, PHONE)).toEqual(home);
  });
});
