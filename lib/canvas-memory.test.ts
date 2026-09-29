import { describe, expect, it } from "vitest";

import { parseCanvasMemory, type CanvasMemory } from "@/lib/canvas-memory";
import { EMPTY_FILTER } from "@/lib/tree-search";

const kept: CanvasMemory = {
  person: "p1",
  view: { x: 120.5, y: -40, zoom: 0.8 },
  sideOnly: true,
  descendantsOf: ["p2", "p3"],
  filter: { text: "khan", country: "Kenya", birthDecade: "1950", living: "living" },
  connection: { from: null, to: null },
  minimized: true,
};

describe("canvas memory (Step 77.3)", () => {
  it("reads back what was kept", () => {
    expect(parseCanvasMemory(JSON.stringify(kept))).toEqual(kept);
  });

  it("is nothing when nothing, or nothing like it, was kept", () => {
    for (const raw of [null, "", "{", "null", "3", '"x"']) {
      expect(parseCanvasMemory(raw)).toBeNull();
    }
  });

  it("starts afresh on any part that's out of shape, keeping the rest", () => {
    const memory = parseCanvasMemory(
      JSON.stringify({
        person: 7,
        view: { x: 1, y: 2, zoom: 0 },
        sideOnly: "yes",
        descendantsOf: ["a", 3, "", "b", "c"],
        filter: { text: 5, birthDecade: "195", living: "maybe" },
        connection: { from: "a", to: ["b"] },
        minimized: 1,
      }),
    );
    expect(memory).toEqual({
      person: null,
      view: null,
      sideOnly: false,
      // Never more than the two the filter takes.
      descendantsOf: ["a", "b"],
      filter: EMPTY_FILTER,
      connection: { from: "a", to: null },
      minimized: false,
    });
    // A view that isn't all numbers is no view.
    expect(
      parseCanvasMemory(JSON.stringify({ ...kept, view: { x: 1, y: "2", zoom: 1 } }))
        ?.view,
    ).toBeNull();
  });
});
