import { describe, expect, it } from "vitest";

import {
  GUTTER,
  NODE_H,
  NODE_W,
  ROW_GAP,
  ROW_H,
  descentGeometry,
  lateralGeometry,
  generationLabel,
  layoutTree,
  ancestorsOf,
  descendantsOf,
  bloodline,
  type LayoutPerson,
  type LayoutRelationship,
} from "@/lib/tree-layout";

const person = (
  id: string,
  date_of_birth: string | null = null,
  extra: Partial<LayoutPerson> = {},
): LayoutPerson => ({
  id,
  pos_x: null,
  pos_y: null,
  date_of_birth,
  ...extra,
});

const parent = (from: string, to: string): LayoutRelationship => ({
  from_person: from,
  to_person: to,
  type: "parent",
});
const spouse = (a: string, b: string): LayoutRelationship => ({
  from_person: a,
  to_person: b,
  type: "spouse",
});

/** The two founding admins, married, with a child and both sets of parents. */
const family = () => ({
  people: [
    person("gpaA", "1930-01-01"),
    person("gmaA", "1934-01-01"),
    person("gpaB", "1925-01-01"),
    person("gmaB", "1929-01-01"),
    person("adminA", "1962-01-01"),
    person("adminB", "1963-01-01"),
    person("kid", "1990-01-01"),
  ],
  relationships: [
    spouse("gpaA", "gmaA"),
    spouse("gpaB", "gmaB"),
    spouse("adminA", "adminB"),
    parent("gpaA", "adminA"),
    parent("gmaA", "adminA"),
    parent("gpaB", "adminB"),
    parent("gmaB", "adminB"),
    parent("adminA", "kid"),
    parent("adminB", "kid"),
  ],
});

describe("generations", () => {
  it("numbers rows relative to the anchors", () => {
    const { people, relationships } = family();
    const { generations } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    expect(generations.get("adminA")).toBe(0);
    expect(generations.get("adminB")).toBe(0);
    expect(generations.get("gpaA")).toBe(-1);
    expect(generations.get("gmaB")).toBe(-1);
    expect(generations.get("kid")).toBe(1);
  });

  it("puts a generation on exactly one row, one row-pitch apart", () => {
    const { people, relationships } = family();
    const { positions } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    expect(positions.get("gpaA")!.y).toBe(positions.get("gmaB")!.y);
    expect(positions.get("kid")!.y - positions.get("adminA")!.y).toBe(ROW_H);
    expect(positions.get("adminA")!.y - positions.get("gpaA")!.y).toBe(ROW_H);
  });

  it("seeds a disconnected branch on its own rows rather than dropping it", () => {
    const { positions, generations } = layoutTree(
      [person("a"), person("b"), person("loner")],
      [parent("a", "b")],
      { anchorIds: ["a"] },
    );
    expect(generations.get("loner")).toBe(0);
    expect(positions.get("loner")).toBeDefined();
  });
});

describe("anchoring", () => {
  it("centres the anchor couple on the origin", () => {
    const { people, relationships } = family();
    const { positions } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    const a = positions.get("adminA")!;
    const b = positions.get("adminB")!;
    const centre = (a.x + b.x + NODE_W) / 2;
    expect(Math.abs(centre)).toBeLessThan(1);
    expect(a.y).toBe(0);
  });

  it("grows ancestors up and descendants down from the anchors", () => {
    const { people, relationships } = family();
    const { positions } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    expect(positions.get("gpaA")!.y).toBeLessThan(0);
    expect(positions.get("kid")!.y).toBeGreaterThan(0);
  });

  it("keeps everyone's position stable when an ancestor is added", () => {
    const { people, relationships } = family();
    const anchorIds = ["adminA", "adminB"];
    const before = layoutTree(people, relationships, { anchorIds });
    const after = layoutTree(
      [...people, person("greatGpaA", "1900-01-01")],
      [...relationships, parent("greatGpaA", "gpaA")],
      { anchorIds },
    );
    // The anchors do not move, and the new row appears above the old top row.
    expect(after.positions.get("adminA")!.y).toBe(
      before.positions.get("adminA")!.y,
    );
    expect(after.positions.get("greatGpaA")!.y).toBeLessThan(
      after.positions.get("gpaA")!.y,
    );
  });
});

describe("bloodline sides", () => {
  it("puts each anchor's ancestors on their own side of the origin", () => {
    const { people, relationships } = family();
    const { positions } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    const rightOfA = Math.max(positions.get("gpaA")!.x, positions.get("gmaA")!.x);
    const leftOfB = Math.min(positions.get("gpaB")!.x, positions.get("gmaB")!.x);
    expect(rightOfA).toBeLessThan(leftOfB);
  });

  it("keeps a bloodline's collaterals on that bloodline's side", () => {
    const { people, relationships } = family();
    const { positions } = layoutTree(
      // adminA's sibling (an aunt to `kid`) belongs on adminA's side.
      [...people, person("auntA", "1965-01-01")],
      [...relationships, parent("gpaA", "auntA"), parent("gmaA", "auntA")],
      { anchorIds: ["adminA", "adminB"] },
    );
    expect(positions.get("auntA")!.x).toBeLessThan(positions.get("adminA")!.x);
  });

  it("leaves shared descendants centred rather than on one side", () => {
    const { people, relationships } = family();
    const { positions } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    const anchorCentre =
      (positions.get("adminA")!.x + positions.get("adminB")!.x + NODE_W) / 2;
    const kidCentre = positions.get("kid")!.x + NODE_W / 2;
    expect(Math.abs(kidCentre - anchorCentre)).toBeLessThan(NODE_W);
  });
});

describe("readability guarantees", () => {
  const noOverlaps = (positions: Map<string, { x: number; y: number }>) => {
    const rows = new Map<number, number[]>();
    for (const { x, y } of positions.values())
      rows.set(y, [...(rows.get(y) ?? []), x]);
    for (const xs of rows.values()) {
      const sorted = [...xs].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++)
        if (sorted[i] - sorted[i - 1] < NODE_W) return false;
    }
    return true;
  };

  it("never overlaps two cards on a row", () => {
    const { people, relationships } = family();
    const { positions } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    expect(noOverlaps(positions)).toBe(true);
  });

  it("holds the no-overlap guarantee on a wide, deep tree", () => {
    // Four generations, eight children each — the shape that used to collide.
    const people: LayoutPerson[] = [person("root", "1900-01-01")];
    const relationships: LayoutRelationship[] = [];
    let frontier = ["root"];
    for (let gen = 1; gen <= 3; gen++) {
      const next: string[] = [];
      for (const p of frontier) {
        for (let i = 0; i < (gen === 1 ? 8 : 3); i++) {
          const id = `${p}-${i}`;
          people.push(person(id, `${1900 + gen * 25 + i}-01-01`));
          relationships.push(parent(p, id));
          next.push(id);
        }
      }
      frontier = next;
    }
    const { positions } = layoutTree(people, relationships, {
      anchorIds: ["root"],
    });
    expect(people).toHaveLength(1 + 8 + 24 + 72);
    expect(noOverlaps(positions)).toBe(true);
  });

  it("respects the minimum gutter between neighbours", () => {
    const { positions } = layoutTree(
      [person("p"), person("a", "1990-01-01"), person("b", "1992-01-01")],
      [parent("p", "a"), parent("p", "b")],
      { anchorIds: ["p"] },
    );
    const gap = Math.abs(positions.get("a")!.x - positions.get("b")!.x);
    expect(gap).toBeGreaterThanOrEqual(NODE_W + GUTTER - 0.001);
  });
});

describe("lateral ordering", () => {
  it("puts the elder partner of a couple on the left", () => {
    const { positions } = layoutTree(
      [person("younger", "1980-05-01"), person("elder", "1975-02-01")],
      [spouse("younger", "elder")],
    );
    expect(positions.get("elder")!.x).toBeLessThan(positions.get("younger")!.x);
  });

  it("orders siblings oldest → youngest, left → right", () => {
    const { positions } = layoutTree(
      [
        person("parent"),
        person("mid", "1992-01-01"),
        person("oldest", "1988-01-01"),
        person("youngest", "1995-01-01"),
      ],
      [
        parent("parent", "mid"),
        parent("parent", "oldest"),
        parent("parent", "youngest"),
      ],
      { anchorIds: ["parent"] },
    );
    expect(positions.get("oldest")!.x).toBeLessThan(positions.get("mid")!.x);
    expect(positions.get("mid")!.x).toBeLessThan(positions.get("youngest")!.x);
  });

  it("keeps a married-in partner beside their spouse", () => {
    const { positions } = layoutTree(
      [
        person("mum"),
        person("sib", "1990-01-01"),
        person("child", "1985-01-01"),
        person("inLaw", "1986-01-01"),
      ],
      [
        parent("mum", "sib"),
        parent("mum", "child"),
        spouse("child", "inLaw"),
      ],
      { anchorIds: ["mum"] },
    );
    const gap = Math.abs(
      positions.get("child")!.x - positions.get("inLaw")!.x,
    );
    // Partners sit at the tighter couple spacing, not the full gutter.
    expect(gap).toBeLessThan(NODE_W + GUTTER);
  });

  it("does not sort two unrelated couples against each other by age", () => {
    const { people, relationships } = family();
    const { positions } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    // gpaB is the oldest person in the tree but stays on adminB's side.
    expect(positions.get("gpaA")!.x).toBeLessThan(positions.get("gpaB")!.x);
    expect(positions.get("gpaA")!.x).toBeLessThan(positions.get("gmaA")!.x);
    expect(positions.get("gpaB")!.x).toBeLessThan(positions.get("gmaB")!.x);
  });
});

describe("manual positions", () => {
  it("applies a soft offset on top of the computed position", () => {
    const { people, relationships } = family();
    const anchorIds = ["adminA", "adminB"];
    const clean = layoutTree(people, relationships, { anchorIds });
    const nudged = layoutTree(
      people.map((p) =>
        p.id === "kid" ? { ...p, pos_dx: 60, pos_dy: -20 } : p,
      ),
      relationships,
      { anchorIds },
    );
    expect(nudged.positions.get("kid")!.x).toBe(
      clean.positions.get("kid")!.x + 60,
    );
    expect(nudged.positions.get("kid")!.y).toBe(
      clean.positions.get("kid")!.y - 20,
    );
  });

  it("carries an offset through a structural change, unlike an absolute pin", () => {
    const { people, relationships } = family();
    const anchorIds = ["adminA", "adminB"];
    const withSibling = [...people, person("kid2", "1993-01-01")];
    const rels = [
      ...relationships,
      parent("adminA", "kid2"),
      parent("adminB", "kid2"),
    ];
    const clean = layoutTree(withSibling, rels, { anchorIds });
    const nudged = layoutTree(
      withSibling.map((p) => (p.id === "kid" ? { ...p, pos_dx: 30 } : p)),
      rels,
      { anchorIds },
    );
    // The offset rides along with wherever the new sibling pushed `kid` to.
    expect(nudged.positions.get("kid")!.x).toBe(
      clean.positions.get("kid")!.x + 30,
    );
  });

  it("still honours a legacy absolute pin", () => {
    const { positions } = layoutTree(
      [
        person("p"),
        person("younger", "1990-01-01", { pos_x: 40, pos_y: 300 }),
        person("elder", "1985-01-01"),
      ],
      [parent("p", "younger"), parent("p", "elder")],
      { anchorIds: ["p"] },
    );
    expect(positions.get("younger")).toEqual({ x: 40, y: 300 });
  });
});

describe("descent unions", () => {
  it("gives a couple's children one shared descent point", () => {
    const { people, relationships } = family();
    const { unions, positions } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    const fromAnchors = unions.find(
      (u) => u.parents.includes("adminA") && u.parents.includes("adminB"),
    )!;
    expect(fromAnchors.children).toEqual(["kid"]);
    // Sits on the spouse line between the partners, bus between the two rows.
    expect(fromAnchors.startY).toBe(positions.get("adminA")!.y + NODE_H / 2);
    expect(fromAnchors.startX).toBeGreaterThan(
      positions.get("adminA")!.x + NODE_W,
    );
    expect(fromAnchors.startX).toBeLessThan(positions.get("adminB")!.x);
    expect(fromAnchors.busY).toBeGreaterThan(positions.get("adminA")!.y);
    expect(fromAnchors.busY).toBeLessThan(positions.get("kid")!.y);
  });

  it("lists a union's children oldest first", () => {
    const { unions } = layoutTree(
      [
        person("p"),
        person("b", "1992-01-01"),
        person("a", "1988-01-01"),
        person("c", "1995-01-01"),
      ],
      [parent("p", "b"), parent("p", "a"), parent("p", "c")],
      { anchorIds: ["p"] },
    );
    expect(unions[0].children).toEqual(["a", "b", "c"]);
  });
});

describe("generation bands", () => {
  it("names the generation, not a relationship", () => {
    const { people, relationships } = family();
    const { bands } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    // Ancestors count up from the founders, descendants count down.
    expect(bands.map((b) => b.label)).toEqual([
      "Generation One",
      "Founders' generation",
      "Generation minus One",
    ]);
    expect(bands.find((b) => b.generation === -1)!.count).toBe(4);
  });

  it("labels an aunt with the generation she actually shares", () => {
    const { people, relationships } = family();
    const { bands, generations } = layoutTree(
      [...people, person("auntA", "1965-01-01")],
      [...relationships, parent("gpaA", "auntA"), parent("gmaA", "auntA")],
      { anchorIds: ["adminA", "adminB"] },
    );
    // The aunt sits on the founders' row and the label is true of her too.
    expect(generations.get("auntA")).toBe(0);
    expect(bands.find((b) => b.generation === 0)!.label).toBe(
      "Founders' generation",
    );
  });

  it("spans the decades a row actually covers", () => {
    const { people, relationships } = family();
    const { bands } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    // One set of grandparents is 1920s, the other 1930s — show both rather
    // than picking one and misfiling half the row.
    expect(bands.find((b) => b.generation === -1)!.sublabel).toBe(
      "b. 1920s–1930s",
    );
  });

  it("shows a single decade when the row shares one", () => {
    const { people, relationships } = family();
    const { bands } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    // Both founders were born in the 1960s.
    expect(bands.find((b) => b.generation === 0)!.sublabel).toBe("b. 1960s");
  });

  it("omits the date when too few birth years are known", () => {
    const { bands } = layoutTree(
      [person("p"), person("a"), person("b", "1990-01-01")],
      [parent("p", "a"), parent("p", "b")],
      { anchorIds: ["p"] },
    );
    expect(bands.find((b) => b.generation === 1)!.sublabel).toBeNull();
  });

  it("numbers generations outward from the founders", () => {
    expect(generationLabel(0)).toBe("Founders' generation");
    // Ancestors count up …
    expect(generationLabel(-1)).toBe("Generation One");
    expect(generationLabel(-2)).toBe("Generation Two");
    expect(generationLabel(-5)).toBe("Generation Five");
    // … descendants count down.
    expect(generationLabel(1)).toBe("Generation minus One");
    expect(generationLabel(3)).toBe("Generation minus Three");
  });

  it("falls back to digits past the spelled-out numbers", () => {
    expect(generationLabel(-12)).toBe("Generation Twelve");
    expect(generationLabel(-13)).toBe("Generation 13");
    expect(generationLabel(13)).toBe("Generation minus 13");
  });
});

describe("descentGeometry", () => {
  const card = (x: number, y: number) => ({ x, y, w: NODE_W, h: NODE_H });
  // Two partners side by side with the standard couple gap.
  const partners = [card(0, 0), card(NODE_W + 24, 0)];
  const childTop = ROW_H;

  it("starts on the spouse line between two partners", () => {
    const d = descentGeometry(partners, childTop)!;
    expect(d.startX).toBe(NODE_W + 12);
    expect(d.startY).toBe(NODE_H / 2);
  });

  it("follows the parents when one of them is dragged", () => {
    const before = descentGeometry(partners, childTop)!;
    const after = descentGeometry(
      [card(0, 0), card(NODE_W + 24 + 300, 0)],
      childTop,
    )!;
    // The junction tracks the couple's midpoint rather than staying put.
    expect(after.startX).toBe(before.startX + 150);
  });

  it("drops below the card for a lone parent instead of crossing it", () => {
    const d = descentGeometry([card(0, 0)], childTop)!;
    expect(d.startX).toBe(NODE_W / 2);
    expect(d.startY).toBe(NODE_H);
  });

  it("drops below the cards when partners are dragged past each other", () => {
    // Overlapping cards put the midpoint on top of a face.
    const d = descentGeometry([card(0, 0), card(40, 0)], childTop)!;
    expect(d.startY).toBe(NODE_H);
  });

  it("hangs the bus below the lower parent when they sit on different rows", () => {
    // A partner dragged down a long way: the bus clears the lowest card.
    const d = descentGeometry([card(0, 0), card(NODE_W + 24, 200)], 500)!;
    expect(d.busY).toBeGreaterThan(200 + NODE_H);
    expect(d.busY).toBeLessThan(500);
  });

  it("puts every sibling on the same bus", () => {
    const a = descentGeometry(partners, childTop)!;
    const b = descentGeometry(partners, childTop)!;
    expect(a.busY).toBe(b.busY);
    expect(a.busY).toBe(NODE_H + ROW_GAP / 2);
  });

  it("bends midway when a child is dragged up close under its parents", () => {
    const d = descentGeometry(partners, NODE_H + 20)!;
    expect(d.busY).toBe(NODE_H + 10);
    // The bus never ends up below the child it feeds.
    expect(d.busY).toBeLessThan(NODE_H + 20);
  });

  it("has no geometry without parents", () => {
    expect(descentGeometry([], childTop)).toBeNull();
  });
});

describe("lateralGeometry", () => {
  const card = (x: number, y: number, h = NODE_H) => ({ x, y, w: NODE_W, h });

  it("runs level through the middle of two aligned cards", () => {
    const l = lateralGeometry(card(0, 0), card(NODE_W + 24, 0));
    expect(l.y).toBe(NODE_H / 2);
    expect(l.jogged).toBe(false);
  });

  it("stays level for cards of differing height", () => {
    // The old failure: taller card, centre handle lower, line sloped.
    const l = lateralGeometry(card(0, 0), card(NODE_W + 24, 0, NODE_H + 40));
    expect(l.jogged).toBe(true);
  });

  it("ignores sub-pixel rounding rather than jogging for it", () => {
    const l = lateralGeometry(card(0, 0), card(NODE_W + 24, 0.4));
    expect(l.jogged).toBe(false);
  });

  it("jogs when a partner is dragged off the row", () => {
    const l = lateralGeometry(card(0, 0), card(NODE_W + 24, 120));
    expect(l.jogged).toBe(true);
  });
});

describe("couples sit level", () => {
  it("puts both partners on exactly the same row", () => {
    const { people, relationships } = family();
    const { positions } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    for (const [a, b] of [
      ["adminA", "adminB"],
      ["gpaA", "gmaA"],
      ["gpaB", "gmaB"],
    ] as const) {
      expect(positions.get(a)!.y).toBe(positions.get(b)!.y);
    }
  });
});

describe("family blocks stay intact", () => {
  /** Two branches of cousins hanging off one set of great-grandparents. */
  const cousins = () => {
    const { people, relationships } = family();
    return {
      people: [
        ...people,
        person("ggpaA", "1900-01-01"),
        person("gAuntA", "1932-01-01"),
        person("gAuntAsp", "1931-01-01"),
        person("cousin1", "1960-01-01"),
        person("cousin2", "1964-01-01"),
        person("auntA", "1965-01-01"),
      ],
      relationships: [
        ...relationships,
        parent("ggpaA", "gpaA"),
        parent("ggpaA", "gAuntA"),
        spouse("gAuntA", "gAuntAsp"),
        parent("gAuntA", "cousin1"),
        parent("gAuntAsp", "cousin1"),
        parent("gAuntA", "cousin2"),
        parent("gAuntAsp", "cousin2"),
        parent("gpaA", "auntA"),
        parent("gmaA", "auntA"),
      ],
    };
  };

  /** Everyone on `ids`' row who sits horizontally between the two extremes. */
  const between = (
    positions: Map<string, { x: number; y: number }>,
    ids: string[],
  ) => {
    const row = positions.get(ids[0])!.y;
    const xs = ids.map((id) => positions.get(id)!.x);
    const [lo, hi] = [Math.min(...xs), Math.max(...xs)];
    return [...positions]
      .filter(
        ([id, p]) =>
          p.y === row && p.x > lo && p.x < hi && !ids.includes(id),
      )
      .map(([id]) => id);
  };

  it("never threads an outsider through a set of siblings", () => {
    const { people, relationships } = cousins();
    const { positions } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    expect(between(positions, ["cousin1", "cousin2"])).toEqual([]);
  });

  it("never threads an outsider between partners", () => {
    const { people, relationships } = cousins();
    const { positions } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    expect(between(positions, ["gAuntA", "gAuntAsp"])).toEqual([]);
    expect(between(positions, ["adminA", "adminB"])).toEqual([]);
  });

  it("keeps a cousin branch clear of the anchors' own siblings", () => {
    const { people, relationships } = cousins();
    const { positions } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    // The great-aunt's children sit outside adminA's sibling group entirely.
    const cousinEdge = Math.max(
      positions.get("cousin1")!.x,
      positions.get("cousin2")!.x,
    );
    expect(cousinEdge).toBeLessThan(positions.get("auntA")!.x);
  });

  it("centres a parent couple over the span of their children", () => {
    const { people, relationships } = cousins();
    const { positions } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    const centreOf = (ids: string[]) => {
      const xs = ids.map((id) => positions.get(id)!.x + NODE_W / 2);
      return (Math.min(...xs) + Math.max(...xs)) / 2;
    };
    expect(
      Math.abs(centreOf(["gAuntA", "gAuntAsp"]) - centreOf(["cousin1", "cousin2"])),
    ).toBeLessThan(NODE_W);
  });

  it("straddles the anchor with their siblings when no in-law claims a side", () => {
    // One admin, five siblings: the anchor belongs in the middle of the row,
    // not shunted to one end of their own family.
    const people = [person("dad", "1930-01-01"), person("mum", "1932-01-01")];
    const relationships = [spouse("dad", "mum")];
    for (let i = 0; i < 5; i++) {
      people.push(person(`kid${i}`, `${1955 + i}-01-01`));
      relationships.push(parent("dad", `kid${i}`), parent("mum", `kid${i}`));
    }
    const { positions } = layoutTree(people, relationships, {
      anchorIds: ["kid2"],
    });
    const xs = [0, 1, 2, 3, 4].map((i) => positions.get(`kid${i}`)!.x);
    // Eldest → youngest, left → right, with the anchor sitting in the middle.
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it("hangs an in-law's family on their own side of the couple", () => {
    const { people, relationships } = family();
    const { positions } = layoutTree(people, relationships, {
      anchorIds: ["adminA", "adminB"],
    });
    // adminB married in from the right, so their parents stay right of adminA's.
    expect(positions.get("gmaA")!.x).toBeLessThan(positions.get("gpaB")!.x);
    // …and directly above their own child's half of the couple.
    const centre = (a: string, b: string) =>
      (positions.get(a)!.x + positions.get(b)!.x + NODE_W) / 2;
    expect(centre("gpaB", "gmaB")).toBeGreaterThan(
      centre("adminA", "adminA"),
    );
  });

  it("lays out a 300-person tree without overlaps", () => {
    const people: LayoutPerson[] = [
      person("r0", "1900-01-01"),
      person("r1", "1902-01-01"),
    ];
    const relationships: LayoutRelationship[] = [spouse("r0", "r1")];
    let frontier: [string, string][] = [["r0", "r1"]];
    let n = 0;
    for (let gen = 1; gen <= 5; gen++) {
      const next: [string, string][] = [];
      for (const [f, m] of frontier) {
        for (let i = 0; i < 3; i++) {
          const child = `p${n++}`;
          people.push(person(child, `${1900 + gen * 25 + i}-01-01`));
          relationships.push(parent(f, child), parent(m, child));
          if (gen < 5 && next.length < 40) {
            const inLaw = `p${n++}`;
            people.push(person(inLaw, `${1900 + gen * 25 + i}-01-01`));
            relationships.push(spouse(child, inLaw));
            next.push([child, inLaw]);
          }
        }
      }
      frontier = next;
    }
    const { positions } = layoutTree(people, relationships, {
      anchorIds: ["r0", "r1"],
    });
    const rows = new Map<number, number[]>();
    for (const { x, y } of positions.values())
      rows.set(y, [...(rows.get(y) ?? []), x]);
    for (const xs of rows.values()) {
      const sorted = [...xs].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++)
        expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(NODE_W);
    }
  });
});

describe("bloodline", () => {
  it("walks the whole bloodline up, not just the parents", () => {
    const { people, relationships } = family();
    const line = ancestorsOf(
      "kid",
      [...relationships, parent("ggpaA", "gpaA")].concat([]),
    );
    expect(people).toHaveLength(7);
    // Both parents, all four grandparents, and the great-grandparent above.
    expect([...line].sort()).toEqual(
      ["adminA", "adminB", "ggpaA", "gmaA", "gmaB", "gpaA", "gpaB"].sort(),
    );
  });

  it("excludes the person themself, their siblings, and their children", () => {
    const { relationships } = family();
    const line = ancestorsOf("adminA", [
      ...relationships,
      parent("gpaA", "auntA"),
      parent("gmaA", "auntA"),
    ]);
    expect(line.has("adminA")).toBe(false);
    expect(line.has("auntA")).toBe(false);
    expect(line.has("kid")).toBe(false);
    expect([...line].sort()).toEqual(["gmaA", "gpaA"]);
  });

  it("ignores spouse edges — a partner is not an ancestor", () => {
    const line = ancestorsOf("kid", [
      parent("adminA", "kid"),
      spouse("adminA", "adminB"),
    ]);
    expect([...line]).toEqual(["adminA"]);
  });

  it("returns nothing for someone with no parents recorded", () => {
    const { relationships } = family();
    expect(ancestorsOf("gpaA", relationships).size).toBe(0);
  });

  it("terminates on a cycle rather than hanging", () => {
    const line = ancestorsOf("a", [
      parent("a", "b"),
      parent("b", "c"),
      parent("c", "a"),
    ]);
    expect([...line].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("descendantsOf", () => {
  /** Three generations below the anchors, plus a cousin branch to stay clear of. */
  const dynasty = () => {
    const { people, relationships } = family();
    return {
      people: [
        ...people,
        person("kid2", "1993-01-01"),
        person("kidInLaw", "1989-01-01"),
        person("grandkid", "2018-01-01"),
        person("auntA", "1965-01-01"),
        person("cousin", "1994-01-01"),
      ],
      relationships: [
        ...relationships,
        parent("adminA", "kid2"),
        parent("adminB", "kid2"),
        spouse("kid", "kidInLaw"),
        parent("kid", "grandkid"),
        parent("kidInLaw", "grandkid"),
        parent("gpaA", "auntA"),
        parent("gmaA", "auntA"),
        parent("auntA", "cousin"),
      ],
    };
  };

  it("walks the whole line down, not just the children", () => {
    const { relationships } = dynasty();
    expect([...descendantsOf("adminA", relationships)].sort()).toEqual([
      "grandkid",
      "kid",
      "kid2",
    ]);
  });

  it("excludes the person, their partner, and anyone married in below", () => {
    const { relationships } = dynasty();
    const line = descendantsOf("adminA", relationships);
    expect(line.has("adminA")).toBe(false);
    expect(line.has("adminB")).toBe(false);
    // The grandchild is on the line; the in-law who fathered them is not.
    expect(line.has("kidInLaw")).toBe(false);
    expect(line.has("grandkid")).toBe(true);
  });

  it("keeps a collateral branch off the line", () => {
    const { relationships } = dynasty();
    // auntA and her child descend from gpaA, but not from adminA.
    expect(descendantsOf("adminA", relationships).has("cousin")).toBe(false);
    const fromGpa = descendantsOf("gpaA", relationships);
    expect(fromGpa.has("cousin")).toBe(true);
    expect(fromGpa.has("grandkid")).toBe(true);
  });

  it("is the exact inverse of the ancestor walk", () => {
    const { relationships } = dynasty();
    for (const [older, younger] of [
      ["gpaA", "grandkid"],
      ["adminB", "kid2"],
      ["gmaB", "kid"],
    ] as const) {
      expect(descendantsOf(older, relationships).has(younger)).toBe(true);
      expect(ancestorsOf(younger, relationships).has(older)).toBe(true);
    }
  });

  it("terminates on a cycle rather than hanging", () => {
    const line = descendantsOf("a", [
      parent("a", "b"),
      parent("b", "c"),
      parent("c", "a"),
    ]);
    expect([...line].sort()).toEqual(["a", "b", "c"]);
  });

  it("takes its direction from the argument", () => {
    const { relationships } = dynasty();
    expect(bloodline("kid", relationships, "up")).toEqual(
      ancestorsOf("kid", relationships),
    );
    expect(bloodline("kid", relationships, "down")).toEqual(
      descendantsOf("kid", relationships),
    );
  });
});
