import { describe, expect, it } from "vitest";

import { EMPTY_FILTER, petMatchesFilter } from "@/lib/tree-search";

const pet = { name: "Biscuit", companions: ["a", "b"] };

describe("petMatchesFilter", () => {
  it("keeps a companion lit when one of its people matched", () => {
    expect(
      petMatchesFilter(pet, { ...EMPTY_FILTER, text: "khan" }, new Set(["b"])),
    ).toBe(true);
  });

  it("dims a companion when none of its people matched", () => {
    expect(
      petMatchesFilter(pet, { ...EMPTY_FILTER, text: "khan" }, new Set(["z"])),
    ).toBe(false);
  });

  it("matches the companion's own name, diacritics folded", () => {
    expect(
      petMatchesFilter(
        { name: "Café", companions: ["z"] },
        { ...EMPTY_FILTER, text: "cafe" },
        new Set(),
      ),
    ).toBe(true);
  });

  it("follows its people for a filter with no free text", () => {
    expect(
      petMatchesFilter(
        pet,
        { ...EMPTY_FILTER, living: "deceased" },
        new Set(["a"]),
      ),
    ).toBe(true);
  });
});
