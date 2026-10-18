import { describe, expect, it } from "vitest";

import { connectionCaption, type CaptionPerson } from "@/lib/connection-caption";
import type { ConnectionRelationship } from "@/lib/connection-path";

// gggggDad
//    |
// ggggDad ─ gggDad ─ ggDad (each the next one's father)
//                      |
//          maGrandad ─ maGranny            wGran          kGran
//                |                           |              |
//     dad ─ mum      auntie            fil ─ mil   wifeAunt   karimMum   karimUncle
//      |              |                  |            |          |
//   me ─ wife      cousin ─ cousinWife  wife, wifeSis ─ karim   wifeCousin
//   bro ─ broWife ← broWifeMum
//   nephew (bro's), son (me and ex), kid2 (me and jo), halfBro (dad and stepMum)
const people = new Map<string, CaptionPerson>(
  (
    [
      ["me", "male"],
      ["wife", "female"],
      ["mum", "female"],
      ["dad", "male"],
      ["maGrandad", "male"],
      ["maGranny", "female"],
      ["ggDad", "male"],
      ["gggDad", "male"],
      ["ggggDad", "male"],
      ["gggggDad", "male"],
      ["auntie", "female"],
      ["cousin", "male"],
      ["cousinWife", "female"],
      ["bro", "male"],
      ["broWife", "female"],
      ["broWifeMum", "female"],
      ["nephew", "male"],
      ["fil", "male"],
      ["mil", "female"],
      ["wifeSis", "female"],
      ["karim", "male"],
      ["karimMum", "female"],
      ["kGran", "female"],
      ["karimUncle", "male"],
      ["wGran", "female"],
      ["wifeAunt", "female"],
      ["wifeCousin", "male"],
      ["ex", "female"],
      ["son", "male"],
      ["jo", "female"],
      ["kid2", "male"],
      ["stepMum", "female"],
      ["halfBro", "male"],
      ["baby", null],
      ["stranger", "male"],
    ] as const
  ).map(([id, sex]) => [id, { first_name: id === "karim" ? "Karim" : id, sex }]),
);

const parent = (from: string, to: string): ConnectionRelationship => ({
  from_person: from,
  to_person: to,
  type: "parent",
});
const spouse = (from: string, to: string, is_divorced = false): ConnectionRelationship => ({
  from_person: from,
  to_person: to,
  type: "spouse",
  is_divorced,
});

const relationships: ConnectionRelationship[] = [
  spouse("me", "wife"),
  parent("dad", "me"),
  parent("mum", "me"),
  spouse("dad", "mum"),
  parent("maGrandad", "mum"),
  parent("maGranny", "mum"),
  spouse("maGrandad", "maGranny"),
  parent("ggDad", "maGrandad"),
  parent("gggDad", "ggDad"),
  parent("ggggDad", "gggDad"),
  parent("gggggDad", "ggggDad"),
  parent("maGrandad", "auntie"),
  parent("maGranny", "auntie"),
  parent("auntie", "cousin"),
  spouse("cousin", "cousinWife"),
  parent("dad", "bro"),
  parent("mum", "bro"),
  spouse("bro", "broWife"),
  parent("broWifeMum", "broWife"),
  parent("bro", "nephew"),
  parent("fil", "wife"),
  parent("mil", "wife"),
  spouse("fil", "mil"),
  parent("fil", "wifeSis"),
  parent("mil", "wifeSis"),
  spouse("karim", "wifeSis"),
  parent("karimMum", "karim"),
  parent("kGran", "karimMum"),
  parent("kGran", "karimUncle"),
  parent("wGran", "fil"),
  parent("wGran", "wifeAunt"),
  parent("wifeAunt", "wifeCousin"),
  spouse("me", "ex", true),
  parent("me", "son"),
  parent("ex", "son"),
  parent("me", "kid2"),
  parent("jo", "kid2"),
  spouse("dad", "stepMum"),
  parent("dad", "halfBro"),
  parent("stepMum", "halfBro"),
  parent("me", "baby"),
];

const caption = (focus: string, self = "me") =>
  connectionCaption(self, focus, people, relationships);

describe("connectionCaption", () => {
  it("says nothing on the member's own leaf, or for someone nothing joins", () => {
    expect(caption("me")).toBeNull();
    expect(caption("stranger")).toBeNull();
    expect(caption("nobody")).toBeNull();
  });

  it("names one link in a word", () => {
    expect(caption("mum")).toBe("Your mother");
    expect(caption("wife")).toBe("Your wife");
    expect(caption("bro")).toBe("Your brother");
    expect(caption("son")).toBe("Your son");
    expect(caption("baby")).toBe("Your child");
  });

  it("says when a marriage has ended, and a half-sibling", () => {
    expect(caption("ex")).toBe("Your former wife");
    expect(caption("halfBro")).toBe("Your half-brother");
  });

  it("says each of two links, so the side shows", () => {
    expect(caption("maGrandad")).toBe("Your mother's father");
    expect(caption("auntie")).toBe("Your mother's sister");
    expect(caption("nephew")).toBe("Your brother's son");
    expect(caption("broWife")).toBe("Your brother's wife");
    expect(caption("wifeSis")).toBe("Your wife's sister");
    expect(caption("stepMum")).toBe("Your father's wife");
    expect(caption("jo")).toBe("Your son's mother");
  });

  it("names a longer line of blood in one word", () => {
    expect(caption("ggDad")).toBe("Your great-grandfather");
    expect(caption("gggDad")).toBe("Your great-great-grandfather");
    expect(caption("cousin")).toBe("Your first cousin");
  });

  it("counts three greats or more", () => {
    expect(caption("ggggDad")).toBe("Your 3rd great-grandfather");
    expect(caption("gggggDad")).toBe("Your 4th great-grandfather");
  });

  it("says a longer chain through a marriage in two words", () => {
    expect(caption("cousinWife")).toBe("Your first cousin's wife");
    expect(caption("wifeCousin")).toBe("Your wife's first cousin");
    // Fewer in-laws first: not "your father-in-law's sister".
    expect(caption("wifeAunt")).toBe("Your wife's aunt");
    // Then the leaf's own piece shortest.
    expect(caption("karim")).toBe("Your sister-in-law's husband");
    expect(caption("broWifeMum")).toBe("Your sister-in-law's mother");
  });

  it("names the nearest person the member can be told about, past that", () => {
    expect(caption("karimMum")).toBe("Karim's mother");
    expect(caption("karimUncle")).toBe("Karim's uncle");
  });

  it("reads from whoever is signed in", () => {
    expect(caption("me", "mum")).toBe("Your son");
    expect(caption("wife", "wifeSis")).toBe("Your sister");
  });
});
