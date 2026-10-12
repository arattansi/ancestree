import { describe, expect, it } from "vitest";

import { byFamilyName, isInvitable, type CandidateCard } from "@/lib/invitable";

const card = (over: Partial<CandidateCard> = {}): CandidateCard => ({
  id: "p1",
  first_name: "Amina",
  preferred_name: null,
  last_name: "Khan",
  is_deceased: false,
  date_of_death: null,
  owner_user_id: "u-root",
  created_by: "u-root",
  placeholder_number: null,
  ...over,
});

const none = new Set<string>();

describe("isInvitable (Step 143)", () => {
  it("takes a living entry nobody is behind", () => {
    expect(isInvitable(card(), none, none)).toBe(true);
  });

  it("leaves out anyone who has died, marked so or dated", () => {
    expect(isInvitable(card({ is_deceased: true }), none, none)).toBe(false);
    expect(isInvitable(card({ date_of_death: "2001-02-03" }), none, none)).toBe(false);
  });

  it("leaves out an entry someone is behind", () => {
    expect(isInvitable(card(), new Set(["p1"]), none)).toBe(false);
    expect(isInvitable(card(), none, new Set(["p1"]))).toBe(false);
    expect(isInvitable(card({ owner_user_id: "u-them" }), none, none)).toBe(false);
  });

  it("leaves out a placeholder child, who comes in through their parent", () => {
    expect(isInvitable(card({ placeholder_number: 1 }), none, none)).toBe(false);
  });
});

describe("byFamilyName", () => {
  it("sorts by surname, then by the name they go by", () => {
    const people = [
      card({ id: "a", first_name: "Zara", last_name: "Ali" }),
      card({ id: "b", first_name: "Yusuf", last_name: "Khan" }),
      card({ id: "c", first_name: "Amir", preferred_name: "Bilal", last_name: "Ali" }),
    ];
    expect([...people].sort(byFamilyName).map((p) => p.id)).toEqual(["c", "a", "b"]);
  });
});
