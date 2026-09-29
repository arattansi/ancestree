import { describe, expect, it } from "vitest";

import {
  partnersOf,
  reach,
  stepsOf,
  toChildren,
  toParents,
  toSiblings,
  type WalkEdge,
} from "@/lib/graph-walk";

const parent = (from: string, to: string): WalkEdge => ({
  from_person: from,
  to_person: to,
  type: "parent",
});
const spouse = (a: string, b: string): WalkEdge => ({
  from_person: a,
  to_person: b,
  type: "spouse",
});
const sibling = (a: string, b: string): WalkEdge => ({
  from_person: a,
  to_person: b,
  type: "sibling",
});

describe("stepsOf", () => {
  const edges = [
    parent("mum", "me"),
    parent("dad", "me"),
    sibling("me", "sis"),
    spouse("mum", "dad"),
  ];

  it("goes up a parent line child to parent, and down it parent to child", () => {
    expect(stepsOf(edges, toParents)).toEqual(new Map([["me", ["mum", "dad"]]]));
    expect(stepsOf(edges, toChildren)).toEqual(
      new Map([
        ["mum", ["me"]],
        ["dad", ["me"]],
      ]),
    );
  });

  it("goes along a sibling line both ways, and nowhere along a marriage", () => {
    expect(stepsOf(edges, toSiblings)).toEqual(
      new Map([
        ["me", ["sis"]],
        ["sis", ["me"]],
      ]),
    );
  });
});

describe("reach", () => {
  it("keeps the seed and follows the steps as far as they go", () => {
    const up = stepsOf([parent("gran", "mum"), parent("mum", "me")], toParents);
    expect(reach(["me"], up)).toEqual(new Set(["me", "mum", "gran"]));
  });

  it("ends a cycle on who it has seen", () => {
    const loop = stepsOf([parent("a", "b"), parent("b", "c"), parent("c", "a")], toChildren);
    expect(reach(["a"], loop)).toEqual(new Set(["a", "b", "c"]));
    // Started from a's children, the loop brings a back in.
    expect(reach(loop.get("a") ?? [], loop)).toEqual(new Set(["a", "b", "c"]));
  });
});

describe("partnersOf", () => {
  it("finds who they married, one step out, apart from them", () => {
    const edges = [spouse("me", "partner"), spouse("partner", "their-ex")];
    expect(partnersOf(new Set(["me"]), edges)).toEqual(new Set(["partner"]));
  });
});
