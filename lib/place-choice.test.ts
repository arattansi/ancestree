import { describe, expect, it } from "vitest";

import { chosenPlace } from "./place-choice";

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
