import { describe, expect, it } from "vitest";

import {
  entriesNamed,
  inviteMatchOf,
  matchQuestion,
  nameKey,
  needsAsking,
  type MatchCard,
} from "@/lib/invite-matches";

function card(over: Partial<MatchCard> = {}): MatchCard {
  return {
    id: "leila",
    first_name: "Leila",
    preferred_name: null,
    last_name: "Haddad",
    maiden_name: null,
    is_deceased: false,
    date_of_death: null,
    date_of_birth: "1961-04-02",
    placeholder_number: null,
    ...over,
  };
}

describe("nameKey", () => {
  it("ignores case, outer and doubled spaces", () => {
    expect(nameKey("  Leila   Anne ")).toBe("leila anne");
    expect(nameKey("HADDAD")).toBe("haddad");
  });

  it("treats a missing name as empty", () => {
    expect(nameKey(null)).toBe("");
    expect(nameKey(undefined)).toBe("");
  });

  it("compares composed and decomposed accents alike", () => {
    expect(nameKey("Zoé")).toBe(nameKey("Zoé"));
  });
});

describe("entriesNamed", () => {
  it("finds an exact first and last name", () => {
    expect(entriesNamed([card()], "leila", " Haddad ")).toEqual([card()]);
  });

  it("matches the name they go by, and a maiden name", () => {
    const liz = card({ id: "liz", first_name: "Elizabeth", preferred_name: "Liz" });
    expect(entriesNamed([liz], "Liz", "Haddad")).toEqual([liz]);
    expect(entriesNamed([liz], "Elizabeth", "Haddad")).toEqual([liz]);
    const married = card({ last_name: "Khoury", maiden_name: "Haddad" });
    expect(entriesNamed([married], "Leila", "Haddad")).toEqual([married]);
    expect(entriesNamed([married], "Leila", "Khoury")).toEqual([married]);
  });

  it("wants both names whole, not a part of one", () => {
    expect(entriesNamed([card()], "Lei", "Haddad")).toEqual([]);
    expect(entriesNamed([card()], "Leila", "")).toEqual([]);
    expect(entriesNamed([card()], "", "Haddad")).toEqual([]);
    expect(entriesNamed([card({ first_name: "Leila Anne" })], "Leila", "Haddad")).toEqual([]);
  });

  it("leaves out the dead, placeholders and blurred cards", () => {
    expect(entriesNamed([card({ is_deceased: true })], "Leila", "Haddad")).toEqual([]);
    expect(entriesNamed([card({ date_of_death: "2020-01-01" })], "Leila", "Haddad")).toEqual([]);
    expect(entriesNamed([card({ placeholder_number: 1 })], "Leila", "Haddad")).toEqual([]);
    expect(entriesNamed([card({ blurred: true })], "Leila", "Haddad")).toEqual([]);
  });

  it("returns every entry by that name", () => {
    const two = [card(), card({ id: "leila-2", date_of_birth: "1990-01-01" })];
    expect(entriesNamed(two, "Leila", "Haddad").map((c) => c.id)).toEqual(["leila", "leila-2"]);
  });
});

describe("matchQuestion", () => {
  it("names them with the year they were born", () => {
    expect(matchQuestion(inviteMatchOf(card()))).toBe("Is this Leila Haddad, b. 1961?");
  });

  it("leaves the year out when the card has none", () => {
    expect(matchQuestion(inviteMatchOf(card({ date_of_birth: null })))).toBe(
      "Is this Leila Haddad?",
    );
  });
});

describe("needsAsking", () => {
  const match = inviteMatchOf(card());

  it("asks about a match nobody has answered", () => {
    expect(needsAsking(match, null)).toBe(true);
  });

  it("doesn't ask with no match", () => {
    expect(needsAsking(null, null)).toBe(false);
  });

  it("doesn't ask again after a no about the same entry", () => {
    expect(needsAsking(match, { entryId: "leila", isThem: false })).toBe(false);
  });

  it("asks again when the name now matches someone else", () => {
    expect(needsAsking(match, { entryId: "other", isThem: false })).toBe(true);
  });

  it("never asks again after a yes", () => {
    expect(needsAsking(match, { entryId: "leila", isThem: true })).toBe(false);
    expect(needsAsking(null, { entryId: "leila", isThem: true })).toBe(false);
  });
});
