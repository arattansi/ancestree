import { describe, expect, it } from "vitest";

import {
  anchorPoint,
  cursorInterval,
  parseCursor,
  peersFrom,
  placePoint,
  presenceColours,
  PRESENCE_COLOURS,
  treeTopic,
} from "@/lib/presence";

describe("treeTopic", () => {
  it("names the tree's channel", () => {
    expect(treeTopic("0b1e7c0e-0000-4000-8000-000000000001")).toBe(
      "tree:0b1e7c0e-0000-4000-8000-000000000001",
    );
  });
});

describe("cursorInterval", () => {
  it("is quick for two and never quicker than 80ms", () => {
    expect(cursorInterval(0)).toBe(80);
    expect(cursorInterval(1)).toBe(80);
  });

  it("slows with the square of the room", () => {
    expect(cursorInterval(2)).toBe(150);
    expect(cursorInterval(4)).toBe(418);
  });

  it("keeps the whole room under the plan's 100 messages a second", () => {
    for (let others = 1; others <= 40; others++) {
      const n = others + 1;
      // Each of n pages sends, and each message reaches the n - 1 others.
      const perSecond = (n * (n - 1) * 1000) / cursorInterval(others);
      if (cursorInterval(others) < 1000) expect(perSecond).toBeLessThan(100);
    }
  });

  it("sends at least once a second however many are looking", () => {
    expect(cursorInterval(50)).toBe(1000);
  });
});

describe("presenceColours", () => {
  it("gives everyone a different colour while there are enough", () => {
    const ids = Array.from({ length: PRESENCE_COLOURS.length }, (_, i) =>
      `user-${i}`,
    );
    const colours = presenceColours(ids);
    expect(new Set(colours.values()).size).toBe(PRESENCE_COLOURS.length);
  });

  it("is the same whatever order the room arrives in", () => {
    const ids = ["c", "a", "e", "b", "d", "f", "g"];
    const one = presenceColours(ids);
    const two = presenceColours([...ids].reverse());
    for (const id of ids) expect(two.get(id)).toBe(one.get(id));
  });

  it("keeps someone's colour when a later id joins", () => {
    // Whoever sorts first keeps the colour their id hashes to.
    const alone = presenceColours(["a"]).get("a");
    expect(presenceColours(["a", "zz", "zzz"]).get("a")).toBe(alone);
  });

  it("repeats colours past ten people rather than failing", () => {
    const ids = Array.from({ length: 14 }, (_, i) => `u${i}`);
    expect(presenceColours(ids).size).toBe(14);
  });
});

describe("anchorPoint and placePoint", () => {
  const cards = [
    { id: "a", x: 0, y: 0, width: 200, height: 100 },
    { id: "b", x: 400, y: 0, width: 200, height: 100 },
  ];

  it("measures from the card the pointer is on", () => {
    expect(anchorPoint({ x: 450, y: 30 }, cards)).toEqual({
      a: "b",
      x: 50,
      y: 30,
    });
  });

  it("picks the nearest card's edge, not its corner", () => {
    // 150 from a's right edge, 50 from b's left one.
    expect(anchorPoint({ x: 350, y: 90 }, cards)?.a).toBe("b");
    expect(anchorPoint({ x: 250, y: 90 }, cards)?.a).toBe("a");
  });

  it("has nothing to measure from without cards", () => {
    expect(anchorPoint({ x: 1, y: 1 }, [])).toBeNull();
  });

  it("lands beside the same card where that card is elsewhere", () => {
    const sent = anchorPoint({ x: 450, y: -20 }, cards)!;
    const here = new Map([["b", { x: 1000, y: 500 }]]);
    expect(placePoint(sent, (id) => here.get(id))).toEqual({
      x: 1050,
      y: 480,
    });
  });

  it("isn't shown when its card isn't drawn here", () => {
    expect(placePoint({ a: "gone", x: 0, y: 0 }, () => null)).toBeNull();
  });
});

describe("parseCursor", () => {
  it("reads a pointer", () => {
    expect(parseCursor({ u: "x", a: "p1", x: 3, y: -4 })).toEqual({
      u: "x",
      point: { a: "p1", x: 3, y: -4 },
    });
  });

  it("reads a pointer leaving the canvas", () => {
    expect(parseCursor({ u: "x", a: null })).toEqual({ u: "x", point: null });
  });

  it("drops anything malformed", () => {
    expect(parseCursor(null)).toBeNull();
    expect(parseCursor("hi")).toBeNull();
    expect(parseCursor({ a: "p1", x: 1, y: 1 })).toBeNull();
    expect(parseCursor({ u: "x", a: "p1", x: "1", y: 1 })).toBeNull();
    expect(parseCursor({ u: "x", a: "p1", x: Infinity, y: 1 })).toBeNull();
    expect(parseCursor({ u: "x", a: 5, x: 1, y: 1 })).toBeNull();
  });
});

describe("peersFrom", () => {
  it("leaves the viewer out and orders who's here before who's away", () => {
    const peers = peersFrom(
      {
        me: [{ person: "p0", name: "Me", away: false }],
        u2: [{ person: "p2", name: "Bo", away: true }],
        u3: [{ person: "p3", name: "Cy", away: false }],
        u1: [{ person: "p1", name: "Al", away: false }],
      },
      "me",
    );
    expect(peers.map((p) => p.userId)).toEqual(["u1", "u3", "u2"]);
  });

  it("is here while any of their tabs is", () => {
    const [peer] = peersFrom(
      {
        u1: [
          { person: "p1", name: "Al", away: true },
          { person: "p1", name: "Al", away: false },
        ],
      },
      "me",
    );
    expect(peer.away).toBe(false);
  });

  it("copes with a meta missing its fields", () => {
    expect(peersFrom({ u1: [{}] }, "me")).toEqual([
      { userId: "u1", person: null, name: "", away: false },
    ]);
  });
});
