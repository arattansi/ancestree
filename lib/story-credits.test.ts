import { describe, expect, it } from "vitest";

import { asCredits, creditGroups, creditLabel, toldLabel } from "@/lib/story-credits";

describe("asCredits", () => {
  it("keeps well-formed credits and drops the rest", () => {
    expect(
      asCredits([
        { id: "a", name: "Nan", role: "storyteller" },
        { id: "b", name: "", role: "interviewer" },
        { id: "c", name: "X", role: "narrator" },
        { name: "No id", role: "storyteller" },
        null,
      ]),
    ).toEqual([
      { id: "a", name: "Nan", role: "storyteller" },
      { id: "b", name: "A relative", role: "interviewer" },
    ]);
    expect(asCredits(null)).toEqual([]);
  });
});

describe("creditGroups", () => {
  it("groups by role, storytellers first, naming the role by how many", () => {
    const groups = creditGroups([
      { id: "1", name: "Raiya", role: "interviewer" },
      { id: "2", name: "Nan", role: "storyteller" },
      { id: "3", name: "Dada", role: "storyteller" },
    ]);
    expect(groups).toEqual([
      {
        role: "storyteller",
        label: "Storytellers",
        people: [
          { id: "2", name: "Nan" },
          { id: "3", name: "Dada" },
        ],
      },
      { role: "interviewer", label: "Interviewer", people: [{ id: "1", name: "Raiya" }] },
    ]);
    expect(creditGroups([])).toEqual([]);
    expect(creditLabel("interviewer", 2)).toBe("Interviewers");
  });
});

describe("toldLabel", () => {
  it("says as much of the date as is known", () => {
    expect(toldLabel("1985-07-01", "month")).toBe("Told July 1985");
    expect(toldLabel("1962-01-01", "year")).toBe("Told 1962");
    expect(toldLabel("1985-07-16", "day")).toBe("Told 16 July 1985");
    expect(toldLabel(null, null)).toBeNull();
  });
});
