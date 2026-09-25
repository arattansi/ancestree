import { describe, expect, it } from "vitest";

import {
  bloodlineIds,
  bloodTiePlacementRefusal,
  bloodTieRefusal,
  bloodTieWarning,
  isBloodline,
  newWithoutBloodTie,
  readBloodTieRefusal,
  upThenDownIds,
  withoutBloodTie,
  type ParentEdge,
} from "@/lib/bloodline";
import type { ConnectionEdge, PersonRef } from "@/lib/connections";

const parent = (from: string, to: string): ParentEdge => ({
  from_person: from,
  to_person: to,
  type: "parent",
});
const spouse = (a: string, b: string): ParentEdge => ({
  from_person: a,
  to_person: b,
  type: "spouse",
});
const sibling = (a: string, b: string): ParentEdge => ({
  from_person: a,
  to_person: b,
  type: "sibling",
});

describe("bloodlineIds", () => {
  it("includes the anchor itself", () => {
    expect(bloodlineIds(["me"], [])).toEqual(new Set(["me"]));
  });

  it("climbs to ancestors and back down to their descendants", () => {
    // grandpa -> dad -> me, and dad -> sister; grandpa -> uncle -> cousin
    const edges = [
      parent("grandpa", "dad"),
      parent("grandpa", "uncle"),
      parent("dad", "me"),
      parent("dad", "sister"),
      parent("uncle", "cousin"),
    ];
    expect(bloodlineIds(["me"], edges)).toEqual(
      new Set(["me", "dad", "grandpa", "sister", "uncle", "cousin"]),
    );
  });

  it("leaves a partner who married in outside", () => {
    const edges = [parent("dad", "me"), spouse("me", "partner")];
    expect(bloodlineIds(["me"], edges).has("partner")).toBe(false);
  });

  it("does not leak back up through a shared child (the co-parent trap)", () => {
    // Our child has two parent edges — one from blood, one from the partner.
    // Walking parent edges undirected would pull the partner in; this must not.
    const edges = [
      parent("dad", "me"),
      spouse("me", "partner"),
      parent("me", "kid"),
      parent("partner", "kid"),
    ];
    const blood = bloodlineIds(["me"], edges);
    expect(blood.has("kid")).toBe(true);
    expect(blood.has("partner")).toBe(false);
  });

  it("leaves the married-in partner's own birth family outside", () => {
    const edges = [
      parent("dad", "me"),
      spouse("me", "partner"),
      parent("partner-dad", "partner"),
      parent("partner-dad", "partner-sister"),
    ];
    const blood = bloodlineIds(["me"], edges);
    expect(blood.has("partner-dad")).toBe(false);
    expect(blood.has("partner-sister")).toBe(false);
  });

  it("takes the union of several anchors — a founding couple's two lines", () => {
    const edges = [
      parent("rattansi", "him"),
      parent("suleman", "her"),
      spouse("him", "her"),
    ];
    expect(bloodlineIds(["him", "her"], edges)).toEqual(
      new Set(["him", "her", "rattansi", "suleman"]),
    );
  });

  it("counts an adoptive child as a descendant — lineage lives on the person", () => {
    const edges = [parent("me", "adopted")];
    expect(bloodlineIds(["me"], edges).has("adopted")).toBe(true);
  });

  it("terminates on a parent cycle rather than looping forever", () => {
    const edges = [parent("a", "b"), parent("b", "a")];
    expect(bloodlineIds(["a"], edges)).toEqual(new Set(["a", "b"]));
  });

  it("counts a sibling line as blood, and everyone descended from them", () => {
    // A brother recorded without the shared parents, then his daughter.
    const edges = [sibling("me", "brother"), parent("brother", "niece")];
    expect(bloodlineIds(["me"], edges)).toEqual(
      new Set(["me", "brother", "niece"]),
    );
  });

  it("follows a sibling line from an ancestor — a great-aunt and her line", () => {
    const edges = [
      parent("grandpa", "dad"),
      parent("dad", "me"),
      sibling("grandpa", "great-aunt"),
      parent("great-aunt", "her-son"),
    ];
    const blood = bloodlineIds(["me"], edges);
    expect(blood.has("great-aunt")).toBe(true);
    expect(blood.has("her-son")).toBe(true);
  });

  it("follows a sibling line from a descendant — a cousin's brother", () => {
    const edges = [
      parent("grandpa", "dad"),
      parent("grandpa", "uncle"),
      parent("dad", "me"),
      parent("uncle", "cousin"),
      sibling("cousin", "cousins-brother"),
    ];
    expect(bloodlineIds(["me"], edges).has("cousins-brother")).toBe(true);
  });

  it("never climbs from a sibling to their other parent", () => {
    // A half-brother through dad: his mother married in, and stays outside.
    const edges = [
      parent("dad", "me"),
      sibling("me", "half-brother"),
      parent("his-mum", "half-brother"),
    ];
    const blood = bloodlineIds(["me"], edges);
    expect(blood.has("half-brother")).toBe(true);
    expect(blood.has("his-mum")).toBe(false);
  });

  it("does not follow a spouse line as if it were a sibling line", () => {
    const edges = [spouse("me", "partner"), sibling("partner", "partners-sister")];
    const blood = bloodlineIds(["me"], edges);
    expect(blood.has("partner")).toBe(false);
    expect(blood.has("partners-sister")).toBe(false);
  });
});

describe("upThenDownIds", () => {
  it("is Step 14's walk: parent edges only, so a sibling line doesn't count", () => {
    const edges = [
      parent("dad", "me"),
      parent("dad", "sister"),
      sibling("me", "brother"),
    ];
    expect(upThenDownIds(["me"], edges)).toEqual(
      new Set(["me", "dad", "sister"]),
    );
  });
});

describe("isBloodline", () => {
  it("fails open when no anchors are configured", () => {
    expect(isBloodline("anyone", [], [])).toBe(true);
  });

  it("gates once anchors exist", () => {
    const edges = [parent("dad", "me"), spouse("me", "partner")];
    expect(isBloodline("me", ["me"], edges)).toBe(true);
    expect(isBloodline("partner", ["me"], edges)).toBe(false);
  });
});

describe("withoutBloodTie", () => {
  // The case found on live (2026-09-25), cut down: the anchor, their mum,
  // gran and great-grandpa; the anchor's brother, who is blood and married
  // someone who married in; and their son, who is blood too.
  const family = [
    parent("great-grandpa", "gran"),
    parent("gran", "mum"),
    parent("mum", "anchor"),
    parent("mum", "brother"),
    spouse("brother", "in-law"),
    parent("brother", "nephew"),
    parent("in-law", "nephew"),
  ];
  const anchors = ["anchor"];

  it("refuses someone added only as a married-in partner's mother — the bug found on live", () => {
    const edges = [...family, parent("in-laws-mum", "in-law")];
    expect(withoutBloodTie(["in-laws-mum"], anchors, edges)).toEqual(["in-laws-mum"]);
  });

  it("takes her once she's also a blood ancestor's sister, and makes her blood", () => {
    const edges = [
      ...family,
      parent("in-laws-mum", "in-law"),
      sibling("in-laws-mum", "great-grandpa"),
    ];
    expect(withoutBloodTie(["in-laws-mum"], anchors, edges)).toEqual([]);
    // A blood relative's daughter is blood too, so the in-law no longer
    // counts as married in.
    expect(bloodlineIds(anchors, edges).has("in-law")).toBe(true);
  });

  it("takes a partner of a blood relative", () => {
    const edges = [...family, spouse("nephew", "nephews-wife")];
    expect(withoutBloodTie(["nephews-wife"], anchors, edges)).toEqual([]);
  });

  it("takes the other parent of a blood child, with no marriage recorded", () => {
    const edges = [...family, parent("brother", "niece"), parent("nieces-mum", "niece")];
    expect(withoutBloodTie(["nieces-mum"], anchors, edges)).toEqual([]);
  });

  it("refuses the married-in partner's parents, siblings and later partners", () => {
    const edges = [
      ...family,
      parent("in-laws-dad", "in-law"),
      sibling("in-law", "in-laws-sister"),
      spouse("in-law", "in-laws-next-partner"),
    ];
    expect(
      withoutBloodTie(
        ["in-laws-dad", "in-laws-sister", "in-laws-next-partner"],
        anchors,
        edges,
      ),
    ).toEqual(["in-laws-dad", "in-laws-sister", "in-laws-next-partner"]);
  });

  it("refuses a child from another relationship, until the blood parent is named", () => {
    // The stepmum's son, added as hers alone; she married the anchor's dad,
    // who is blood.
    const blended = [parent("their-dad", "anchor"), spouse("their-dad", "stepmum")];
    const stepmumsOnly = [...blended, parent("stepmum", "stepbrother")];
    expect(withoutBloodTie(["stepbrother"], ["anchor"], stepmumsOnly)).toEqual([
      "stepbrother",
    ]);
    const both = [...stepmumsOnly, parent("their-dad", "stepbrother")];
    expect(withoutBloodTie(["stepbrother"], ["anchor"], both)).toEqual([]);
  });

  it("refuses someone connected to nobody, as a Root once could seed them", () => {
    expect(withoutBloodTie(["stranger"], anchors, family)).toEqual(["stranger"]);
  });

  it("judges a chain once its lines are drawn — new grandparents through a new parent", () => {
    // The anchor's dad and his mum, both new in one call.
    const edges = [
      ...family,
      parent("anchors-dad", "anchor"),
      parent("anchors-gran", "anchors-dad"),
    ];
    expect(withoutBloodTie(["anchors-gran", "anchors-dad"], anchors, edges)).toEqual(
      [],
    );
  });

  it("refuses the end of a chain that runs through a new partner only", () => {
    // The nephew's new wife, then a child of hers alone.
    const edges = [
      ...family,
      spouse("nephew", "wife"),
      parent("wife", "her-child"),
    ];
    expect(withoutBloodTie(["wife", "her-child"], anchors, edges)).toEqual([
      "her-child",
    ]);
  });

  it("keeps the order it was given", () => {
    const edges = [...family, parent("x", "in-law"), sibling("y", "in-law")];
    expect(withoutBloodTie(["y", "nephew", "x"], anchors, edges)).toEqual([
      "y",
      "x",
    ]);
  });

  it("has no gate on a tree with no anchors", () => {
    expect(withoutBloodTie(["anyone"], [], [])).toEqual([]);
  });
});

describe("readBloodTieRefusal", () => {
  it("reads who was refused, from adding people", () => {
    expect(
      readBloodTieRefusal({
        message: "BLOODLINE_GATE: Jane Doe has no blood tie to this tree",
        details: "new:0",
      }),
    ).toEqual({ name: "Jane Doe", index: 0, personId: null });
  });

  it("reads who was refused, from bringing people over", () => {
    expect(
      readBloodTieRefusal({
        message: "BLOODLINE_GATE: John Doe has no blood tie to this tree",
        details: "1f0c1c3e-8f6a-4a3e-9d7e-2d7b5f0e9a11",
      }),
    ).toEqual({
      name: "John Doe",
      index: null,
      personId: "1f0c1c3e-8f6a-4a3e-9d7e-2d7b5f0e9a11",
    });
  });

  it("copes with no name or detail", () => {
    expect(readBloodTieRefusal({ message: "BLOODLINE_GATE" })).toEqual({
      name: null,
      index: null,
      personId: null,
    });
  });

  it("is null for any other error", () => {
    expect(readBloodTieRefusal({ message: "OWN_LINE: a Leaf adds relatives on their own line" })).toBeNull();
    expect(readBloodTieRefusal(null)).toBeNull();
  });
});

describe("bloodTieRefusal", () => {
  const jane = { name: "Jane Doe", index: 1, personId: null };

  it("names who needs a blood tie", () => {
    expect(bloodTieRefusal(jane)).toBe(
      "Jane Doe isn't connected to anyone born into this family. Connect them to a blood relative too.",
    );
  });

  it("speaks to a member adding themselves", () => {
    expect(bloodTieRefusal({ ...jane, index: 0 }, 0)).toBe(
      "Connect yourself to someone born into this family, as their child, parent, sibling or partner.",
    );
    // Someone else in their chain is named as usual.
    expect(bloodTieRefusal(jane, 0)).toMatch(/^Jane Doe isn't/);
  });

  it("falls back when the database gave no name", () => {
    expect(bloodTieRefusal({ name: null, index: null, personId: null })).toMatch(
      /^This person isn't/,
    );
  });

  it("tells a Root bringing people over what to bring", () => {
    expect(
      bloodTiePlacementRefusal({ name: "John Doe", index: null, personId: "b" }),
    ).toBe(
      "John Doe isn't connected to anyone born into this family. Bring them with a blood relative they're connected to.",
    );
  });
});

describe("newWithoutBloodTie", () => {
  // The anchor's brother is blood and married someone who married in; the
  // nephew is their son.
  const bloodline = {
    anchors: ["anchor"],
    edges: [
      parent("great-grandpa", "gran"),
      parent("gran", "mum"),
      parent("mum", "anchor"),
      parent("mum", "brother"),
      spouse("brother", "in-law"),
      parent("brother", "nephew"),
      parent("in-law", "nephew"),
    ],
  };
  const newP = (index: number): PersonRef => ({ kind: "new", index });
  const on = (id: string): PersonRef => ({ kind: "existing", id });
  const line = (
    type: ConnectionEdge["type"],
    a: PersonRef,
    b: PersonRef,
  ): ConnectionEdge => ({ type, a, b });

  it("foresees the add found on live: a married-in partner's mother, nothing else", () => {
    expect(
      newWithoutBloodTie(1, [line("parent", newP(0), on("in-law"))], bloodline),
    ).toEqual([0]);
  });

  it("clears once she's also a blood ancestor's sister", () => {
    expect(
      newWithoutBloodTie(
        1,
        [
          line("parent", newP(0), on("in-law")),
          line("sibling", on("great-grandpa"), newP(0)),
        ],
        bloodline,
      ),
    ).toEqual([]);
  });

  it("needs the blood parent ticked on a child of someone who married in", () => {
    const inLawsChild = line("parent", on("in-law"), newP(0));
    expect(newWithoutBloodTie(1, [inLawsChild], bloodline)).toEqual([0]);
    expect(
      newWithoutBloodTie(
        1,
        [inLawsChild, line("parent", on("brother"), newP(0))],
        bloodline,
      ),
    ).toEqual([]);
  });

  it("points at the right person in a chain", () => {
    // The nephew's new wife (in between), then a child of hers alone.
    expect(
      newWithoutBloodTie(
        2,
        [
          line("spouse", on("nephew"), newP(1)),
          line("parent", newP(1), newP(0)),
        ],
        bloodline,
      ),
    ).toEqual([0]);
    // A new child of the brother's, then their partner: both fine.
    expect(
      newWithoutBloodTie(
        2,
        [
          line("parent", on("brother"), newP(1)),
          line("spouse", newP(1), newP(0)),
        ],
        bloodline,
      ),
    ).toEqual([]);
  });

  it("warns of nothing on a tree with no anchors", () => {
    expect(
      newWithoutBloodTie(1, [], { anchors: [], edges: bloodline.edges }),
    ).toEqual([]);
  });
});

describe("bloodTieWarning", () => {
  it("names who they'd hang off when that's why", () => {
    expect(
      bloodTieWarning({ name: "Jane Doe", nonBloodAnchor: "Mary Roe" }),
    ).toBe(
      "Only blood relatives and their partners can be added. Mary Roe isn't a blood relative, so connect Jane Doe to someone who is, too.",
    );
  });

  it("asks for a blood relative otherwise", () => {
    expect(bloodTieWarning({ name: "Jane Doe" })).toBe(
      "Only blood relatives and their partners can be added. Connect Jane Doe to someone born into this family, too.",
    );
  });

  it("speaks to a member adding themselves", () => {
    expect(
      bloodTieWarning({ name: "Jane", self: true, nonBloodAnchor: "Mary" }),
    ).toBe(
      "Only blood relatives and their partners can be added. Connect yourself to someone born into this family, as their child, parent, sibling or partner.",
    );
  });
});
