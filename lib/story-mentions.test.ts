import { describe, expect, it } from "vitest";

import { mentionedIn } from "@/lib/story-mentions";
import type { TagOption, TagPerson } from "@/lib/tag-person";

function person(first: string, last: string, extra: Partial<TagPerson> = {}): TagPerson {
  return {
    first,
    middle: null,
    preferred: null,
    last,
    maiden: null,
    born: null,
    bornPrecision: "day",
    bornCirca: false,
    died: null,
    diedPrecision: "day",
    diedCirca: false,
    deceased: false,
    ...extra,
  };
}

const amarshi: TagOption = { id: "a", label: "Amarshi Sayani", person: person("Amarshi", "Sayani") };
const rose: TagOption = { id: "r", label: "Rose Patel", person: person("Rose", "Patel") };
const jane: TagOption = {
  id: "j",
  label: "Jane Doe",
  person: person("Jane", "Doe", { middle: "Quinn", maiden: "Smith" }),
};
const jane2: TagOption = { id: "j2", label: "Jane Roe", person: person("Jane", "Roe") };
const basic: TagOption = { id: "b", label: "Someone" };
const everyone = [amarshi, rose, jane, jane2, basic];

const ids = (text: string) => mentionedIn(text, everyone).map((o) => o.id);

describe("mentionedIn", () => {
  it("finds full names, whatever the case or accents", () => {
    expect(ids("We visited amarshi SAYANI in Mombasa.")).toEqual(["a"]);
    expect(ids("Jane Doe, née Jane Smith, kept the shop.")).toEqual(["j"]);
  });

  it("finds a full name with middle names or initials", () => {
    expect(ids("Jane Quinn Doe sang.")).toEqual(["j"]);
    expect(ids("Jane Q. Doe sang.")).toEqual(["j"]);
  });

  it("takes a lone given name only when capitalised and nobody else has it", () => {
    expect(ids("Amarshi told us everything.")).toEqual(["a"]);
    expect(ids("the rose by the door")).toEqual([]);
    expect(ids("Rose came home.")).toEqual(["r"]);
    // Two Janes on the tree: "Jane" alone is nobody in particular.
    expect(ids("Jane came home.")).toEqual([]);
  });

  it("never suggests a card whose name this tree doesn't show", () => {
    expect(ids("Someone was there.")).toEqual([]);
  });

  it("needs whole words", () => {
    expect(ids("Amarshis and Sayanis")).toEqual([]);
  });
});
