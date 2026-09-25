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
  // The Family Tree as it stood on 2026-09-25, cut down: Raiya is the anchor,
  // Kulsum her grandmother, Hassanali Kulsum's father. Arzu is blood and
  // married Shireen, who married in; their son Bijhan is blood.
  const family = [
    parent("hassanali", "kulsum"),
    parent("kulsum", "safia"),
    parent("safia", "raiya"),
    parent("safia", "arzu"),
    spouse("arzu", "shireen"),
    parent("arzu", "bijhan"),
    parent("shireen", "bijhan"),
  ];
  const anchors = ["raiya"];

  it("refuses Rosy added only as Shireen's mother — the bug found on live", () => {
    const edges = [...family, parent("rosy", "shireen")];
    expect(withoutBloodTie(["rosy"], anchors, edges)).toEqual(["rosy"]);
  });

  it("takes Rosy once she's also Hassanali's sister, and makes her blood", () => {
    const edges = [
      ...family,
      parent("rosy", "shireen"),
      sibling("rosy", "hassanali"),
    ];
    expect(withoutBloodTie(["rosy"], anchors, edges)).toEqual([]);
    // A blood relative's daughter is blood too, so Shireen no longer counts
    // as married in.
    expect(bloodlineIds(anchors, edges).has("shireen")).toBe(true);
  });

  it("takes a partner of a blood relative", () => {
    const edges = [...family, spouse("bijhan", "bijhans-wife")];
    expect(withoutBloodTie(["bijhans-wife"], anchors, edges)).toEqual([]);
  });

  it("takes the other parent of a blood child, with no marriage recorded", () => {
    const edges = [...family, parent("arzu", "rehan"), parent("rehans-mum", "rehan")];
    expect(withoutBloodTie(["rehans-mum"], anchors, edges)).toEqual([]);
  });

  it("refuses the married-in partner's parents, siblings and later partners", () => {
    const edges = [
      ...family,
      parent("shireens-dad", "shireen"),
      sibling("shireen", "shireens-sister"),
      spouse("shireen", "shireens-next-partner"),
    ];
    expect(
      withoutBloodTie(
        ["shireens-dad", "shireens-sister", "shireens-next-partner"],
        anchors,
        edges,
      ),
    ).toEqual(["shireens-dad", "shireens-sister", "shireens-next-partner"]);
  });

  it("refuses a child from another relationship, until the blood parent is named", () => {
    // Brandon, added as Beth's son alone; Beth married Kipchoge, who is
    // blood as the anchor Tobi's father.
    const white = [parent("kipchoge", "tobi"), spouse("kipchoge", "beth")];
    const bethsOnly = [...white, parent("beth", "brandon")];
    expect(withoutBloodTie(["brandon"], ["tobi"], bethsOnly)).toEqual([
      "brandon",
    ]);
    const both = [...bethsOnly, parent("kipchoge", "brandon")];
    expect(withoutBloodTie(["brandon"], ["tobi"], both)).toEqual([]);
  });

  it("refuses someone connected to nobody, as a Root once could seed them", () => {
    expect(withoutBloodTie(["stranger"], anchors, family)).toEqual(["stranger"]);
  });

  it("judges a chain once its lines are drawn — new grandparents through a new parent", () => {
    // Raiya's father and his mother, both new in one call.
    const edges = [
      ...family,
      parent("raiyas-dad", "raiya"),
      parent("raiyas-gran", "raiyas-dad"),
    ];
    expect(withoutBloodTie(["raiyas-gran", "raiyas-dad"], anchors, edges)).toEqual(
      [],
    );
  });

  it("refuses the end of a chain that runs through a new partner only", () => {
    // Bijhan's new wife, then a child of hers alone.
    const edges = [
      ...family,
      spouse("bijhan", "wife"),
      parent("wife", "her-child"),
    ];
    expect(withoutBloodTie(["wife", "her-child"], anchors, edges)).toEqual([
      "her-child",
    ]);
  });

  it("keeps the order it was given", () => {
    const edges = [...family, parent("x", "shireen"), sibling("y", "shireen")];
    expect(withoutBloodTie(["y", "bijhan", "x"], anchors, edges)).toEqual([
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
        message: "BLOODLINE_GATE: Rosy Tejpar has no blood tie to this tree",
        details: "new:0",
      }),
    ).toEqual({ name: "Rosy Tejpar", index: 0, personId: null });
  });

  it("reads who was refused, from bringing people over", () => {
    expect(
      readBloodTieRefusal({
        message: "BLOODLINE_GATE: Brandon Nichols has no blood tie to this tree",
        details: "1f0c1c3e-8f6a-4a3e-9d7e-2d7b5f0e9a11",
      }),
    ).toEqual({
      name: "Brandon Nichols",
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
  const rosy = { name: "Rosy Tejpar", index: 1, personId: null };

  it("names who needs a blood tie", () => {
    expect(bloodTieRefusal(rosy)).toBe(
      "Rosy Tejpar isn't connected to anyone born into this family. Connect them to a blood relative too.",
    );
  });

  it("speaks to a member adding themselves", () => {
    expect(bloodTieRefusal({ ...rosy, index: 0 }, 0)).toBe(
      "Connect yourself to someone born into this family, as their child, parent, sibling or partner.",
    );
    // Someone else in their chain is named as usual.
    expect(bloodTieRefusal(rosy, 0)).toMatch(/^Rosy Tejpar isn't/);
  });

  it("falls back when the database gave no name", () => {
    expect(bloodTieRefusal({ name: null, index: null, personId: null })).toMatch(
      /^This person isn't/,
    );
  });

  it("tells a Root bringing people over what to bring", () => {
    expect(
      bloodTiePlacementRefusal({ name: "Brandon Nichols", index: null, personId: "b" }),
    ).toBe(
      "Brandon Nichols isn't connected to anyone born into this family. Bring them with a blood relative they're connected to.",
    );
  });
});

describe("newWithoutBloodTie", () => {
  // Raiya is the anchor; Arzu is blood and married Shireen, who married in;
  // Bijhan is their son.
  const bloodline = {
    anchors: ["raiya"],
    edges: [
      parent("hassanali", "kulsum"),
      parent("kulsum", "safia"),
      parent("safia", "raiya"),
      parent("safia", "arzu"),
      spouse("arzu", "shireen"),
      parent("arzu", "bijhan"),
      parent("shireen", "bijhan"),
    ],
  };
  const newP = (index: number): PersonRef => ({ kind: "new", index });
  const on = (id: string): PersonRef => ({ kind: "existing", id });
  const line = (
    type: ConnectionEdge["type"],
    a: PersonRef,
    b: PersonRef,
  ): ConnectionEdge => ({ type, a, b });

  it("foresees Rosy's add as it happened: Shireen's mother, nothing else", () => {
    expect(
      newWithoutBloodTie(1, [line("parent", newP(0), on("shireen"))], bloodline),
    ).toEqual([0]);
  });

  it("clears once she's also Hassanali's sister", () => {
    expect(
      newWithoutBloodTie(
        1,
        [
          line("parent", newP(0), on("shireen")),
          line("sibling", on("hassanali"), newP(0)),
        ],
        bloodline,
      ),
    ).toEqual([]);
  });

  it("needs the blood parent ticked on a child of someone who married in", () => {
    const shireensChild = line("parent", on("shireen"), newP(0));
    expect(newWithoutBloodTie(1, [shireensChild], bloodline)).toEqual([0]);
    expect(
      newWithoutBloodTie(
        1,
        [shireensChild, line("parent", on("arzu"), newP(0))],
        bloodline,
      ),
    ).toEqual([]);
  });

  it("points at the right person in a chain", () => {
    // Bijhan's new wife (in between), then a child of hers alone.
    expect(
      newWithoutBloodTie(
        2,
        [
          line("spouse", on("bijhan"), newP(1)),
          line("parent", newP(1), newP(0)),
        ],
        bloodline,
      ),
    ).toEqual([0]);
    // A new blood child of Arzu, then their partner: both fine.
    expect(
      newWithoutBloodTie(
        2,
        [
          line("parent", on("arzu"), newP(1)),
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
      bloodTieWarning({ name: "Rosy Tejpar", nonBloodAnchor: "Shireen Suleman" }),
    ).toBe(
      "Only blood relatives and their partners can be added. Shireen Suleman isn't a blood relative, so connect Rosy Tejpar to someone who is, too.",
    );
  });

  it("asks for a blood relative otherwise", () => {
    expect(bloodTieWarning({ name: "Rosy Tejpar" })).toBe(
      "Only blood relatives and their partners can be added. Connect Rosy Tejpar to someone born into this family, too.",
    );
  });

  it("speaks to a member adding themselves", () => {
    expect(
      bloodTieWarning({ name: "Rosy", self: true, nonBloodAnchor: "Shireen" }),
    ).toBe(
      "Only blood relatives and their partners can be added. Connect yourself to someone born into this family, as their child, parent, sibling or partner.",
    );
  });
});
