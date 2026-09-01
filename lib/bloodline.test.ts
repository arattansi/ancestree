import { describe, expect, it } from "vitest";

import {
  bloodlineIds,
  descendantIds,
  growthAllowedIds,
  isBloodline,
  type ParentEdge,
} from "@/lib/bloodline";

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

describe("growthAllowedIds", () => {
  // dad -> partner (blood); the caller married the partner and has a child
  // with them, plus a birth family of their own.
  const edges = [
    parent("dad", "partner"),
    spouse("me", "partner"),
    parent("partner", "kid"),
    parent("my-dad", "me"),
    parent("my-dad", "my-sister"),
  ];

  it("lets a married-in member add their own descendants", () => {
    const allowed = growthAllowedIds("me", ["partner"], [
      ...edges,
      parent("me", "kid"),
    ]);
    expect(allowed.has("kid")).toBe(true);
  });

  it("still refuses their own parents and siblings", () => {
    const allowed = growthAllowedIds("me", ["partner"], edges);
    expect(allowed.has("my-dad")).toBe(false);
    expect(allowed.has("my-sister")).toBe(false);
  });

  it("includes the partner's kin", () => {
    const allowed = growthAllowedIds("me", ["partner"], edges);
    expect(allowed.has("dad")).toBe(true);
    expect(allowed.has("kid")).toBe(true);
  });

  it("is just the bloodline for a blood member", () => {
    expect(growthAllowedIds("partner", ["partner"], edges)).toEqual(
      bloodlineIds(["partner"], edges),
    );
  });

  it("descendantIds counts the root itself", () => {
    expect(descendantIds("me", [parent("me", "kid")])).toEqual(
      new Set(["me", "kid"]),
    );
  });
});
