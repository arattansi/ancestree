import { describe, expect, it } from "vitest";

import { chosenPlace, isLink, unmatchedSearch } from "./place-choice";

const abidjan = { value: 2293538, label: "Abidjan, Côte d’Ivoire" };
const saved = { value: 184745, label: "Nairobi, Kenya" };

describe("chosenPlace", () => {
  it("shows nothing when the form has no place", () => {
    expect(chosenPlace(null, abidjan, saved)).toBeNull();
  });

  it("keeps the picked place, whatever the search results do", () => {
    // The bug: the pick's own label came back as a search with no results,
    // the list emptied, and the picker fell back to the old label.
    expect(chosenPlace(abidjan.value, abidjan, saved)).toBe(abidjan);
  });

  it("falls back when the value no longer matches the pick", () => {
    expect(chosenPlace(saved.value, abidjan, saved)).toBe(saved);
  });

  it("falls back to the label the form opened with before any pick", () => {
    expect(chosenPlace(saved.value, null, saved)).toBe(saved);
  });

  it("hands back the same object every time", () => {
    const first = chosenPlace(abidjan.value, abidjan, saved);
    const second = chosenPlace(abidjan.value, abidjan, saved);
    expect(second).toBe(first);
  });
});

describe("isLink", () => {
  it("spots a pasted page", () => {
    expect(isLink("https://villageinfo.org/village/513810")).toBe(true);
    expect(isLink("  http://example.com ")).toBe(true);
    expect(isLink("www.villageinfo.org/village/513810")).toBe(true);
  });

  it("leaves names alone", () => {
    for (const name of ["Shishang", "St. Louis", "Kalavad taluka", "Washington, D.C."]) {
      expect(isLink(name)).toBe(false);
    }
  });
});

describe("unmatchedSearch", () => {
  it("offers a Root the name they typed", () => {
    expect(unmatchedSearch(" Shishang ", { canAdd: true })).toEqual({
      note: "No matching place.",
      add: "Shishang",
    });
  });

  it("offers nothing to add to anyone else", () => {
    expect(unmatchedSearch("Shishang", { canAdd: false })).toEqual({
      note: "No matching place.",
      add: null,
    });
  });

  it("asks for a name, never adds a link", () => {
    expect(
      unmatchedSearch("https://villageinfo.org/village/513810", { canAdd: true }),
    ).toEqual({ note: "Type the place’s name, not a link.", add: null });
  });

  it("waits for two letters", () => {
    expect(unmatchedSearch("S", { canAdd: true })).toEqual({
      note: "Type at least two letters.",
      add: null,
    });
  });
});
