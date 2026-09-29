import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import { keepEntries, keepNodes } from "@/lib/canvas-nodes";

const amina = { id: "1", first_name: "Amina" };
const salim = { id: "2", first_name: "Salim" };

function node(id: string, person: object, x = 0, extra: Partial<Node> = {}): Node {
  return {
    id,
    type: "person",
    position: { x, y: 0 },
    data: { person, isSelf: false, selected: false, dimmed: false },
    ...extra,
  };
}

const measured = { width: 120, height: 80 };

describe("re-seeding the canvas without a blink (Step 87.1)", () => {
  it("keeps the canvas's own cards when nothing about them changed", () => {
    const held = [
      node("1", amina, 0, { measured }),
      node("2", salim, 200, { measured }),
    ];
    const out = keepNodes(held, [node("1", amina, 0), node("2", salim, 200)]);
    expect(out).toBe(held);
  });

  it("carries the measurement onto a card that changed", () => {
    const held = [node("1", amina, 0, { measured }), node("2", salim, 200, { measured })];
    const renamed = { ...salim, first_name: "Salim K" };
    const out = keepNodes(held, [node("1", amina, 0), node("2", renamed, 200)]);
    expect(out[0]).toBe(held[0]);
    expect(out[1]).not.toBe(held[1]);
    expect(out[1].data.person).toBe(renamed);
    expect(out[1].measured).toBe(measured);
  });

  it("moves a card the layout moved, still measured", () => {
    const held = [node("1", amina, 0, { measured })];
    const out = keepNodes(held, [node("1", amina, 40)]);
    expect(out[0].position).toEqual({ x: 40, y: 0 });
    expect(out[0].measured).toBe(measured);
  });

  it("locks or unlocks a card that is otherwise the same", () => {
    const held = [node("1", amina, 0, { measured })];
    const out = keepNodes(held, [node("1", amina, 0, { draggable: false })]);
    expect(out[0].draggable).toBe(false);
    expect(out[0].measured).toBe(measured);
  });

  it("brings a new card as it comes, and drops one that's gone", () => {
    const held = [node("1", amina, 0, { measured }), node("2", salim, 200, { measured })];
    const newborn = node("3", { id: "3" }, 400);
    const out = keepNodes(held, [node("1", amina, 0), newborn]);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(held[0]);
    expect(out[1]).toBe(newborn);
  });

  it("keeps a card's data where its flags came out the same", () => {
    const prev = new Map([
      ["1", { person: amina, dimmed: false }],
      ["2", { person: salim, dimmed: false }],
    ]);
    const same = new Map([
      ["1", { person: amina, dimmed: false }],
      ["2", { person: salim, dimmed: false }],
    ]);
    expect(keepEntries(prev, same)).toBe(prev);
    const dimmed = new Map([
      ["1", { person: amina, dimmed: false }],
      ["2", { person: salim, dimmed: true }],
    ]);
    const out = keepEntries(prev, dimmed);
    expect(out.get("1")).toBe(prev.get("1"));
    expect(out.get("2")).toBe(dimmed.get("2"));
  });
});
