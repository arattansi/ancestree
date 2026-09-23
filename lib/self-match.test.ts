import { describe, expect, it } from "vitest";

import {
  candidateSummary,
  canSearchName,
  matchConfidence,
  normalizeTypedName,
  onboardingName,
  onboardingOpening,
  toSelfCandidate,
  type SelfCandidate,
} from "@/lib/self-match";

const base: SelfCandidate = {
  id: "p1",
  name: "Amina Rattansi",
  lifespan: "b. 1970",
  birthplace: "Nairobi, Kenya",
  parents: "Karim & Zainab",
  score: 0.9,
};

describe("normalizeTypedName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeTypedName("  Aalim   Karim ")).toBe("Aalim Karim");
  });
});

describe("canSearchName", () => {
  it("needs both halves of the name", () => {
    expect(canSearchName("Aalim", "Rattansi")).toBe(true);
    expect(canSearchName("", "Rattansi")).toBe(false);
    expect(canSearchName("Aalim", "  ")).toBe(false);
  });
});

describe("matchConfidence", () => {
  it("labels near-exact scores strong and the rest close", () => {
    expect(matchConfidence(1)).toBe("strong");
    expect(matchConfidence(0.85)).toBe("strong");
    expect(matchConfidence(0.84)).toBe("close");
  });
});

describe("candidateSummary", () => {
  it("joins the details that help someone recognise themselves", () => {
    expect(candidateSummary(base)).toBe(
      "b. 1970 · Nairobi, Kenya · child of Karim & Zainab",
    );
  });

  it("falls back when the entry is bare", () => {
    expect(
      candidateSummary({ ...base, lifespan: null, birthplace: null, parents: null }),
    ).toBe("No other details on file");
  });
});

describe("toSelfCandidate", () => {
  it("maps an RPC row onto the list shape", () => {
    expect(
      toSelfCandidate({
        id: "p2",
        first_name: "Amina",
        preferred_name: null,
        last_name: "Rattansi",
        date_of_birth: "1970-04-02",
        date_of_death: null,
        is_deceased: false,
        city_of_birth: "Nairobi",
        country_of_birth: "Kenya",
        parent_names: "Karim & Zainab",
        score: 0.92,
      }),
    ).toEqual({
      id: "p2",
      name: "Amina Rattansi",
      lifespan: "b. 1970",
      birthplace: "Nairobi, Kenya",
      parents: "Karim & Zainab",
      score: 0.92,
    });
  });
});

describe("onboardingName", () => {
  const nothing = { first_name: "", last_name: "" };

  it("takes the halves they joined by, split where they were", () => {
    expect(
      onboardingName({
        displayName: "Mary Ann Smith",
        email: "mas@example.com",
        joinedAs: { first_name: "Mary Ann", last_name: "Smith" },
      }),
    ).toEqual({ first_name: "Mary Ann", last_name: "Smith" });
  });

  it("splits the display name when there are no halves to go by", () => {
    expect(
      onboardingName({ displayName: "Zahra Suleman", email: "zs@example.com", joinedAs: null }),
    ).toEqual({ first_name: "Zahra", last_name: "Suleman" });
  });

  it("goes by the display name once they've renamed themselves", () => {
    expect(
      onboardingName({
        displayName: "Mary Jones",
        email: "mas@example.com",
        joinedAs: { first_name: "Mary Ann", last_name: "Smith" },
      }),
    ).toEqual({ first_name: "Mary", last_name: "Jones" });
  });

  it("minds only the spacing when matching the halves to the display name", () => {
    expect(
      onboardingName({
        displayName: " Mary  Ann Smith ",
        email: null,
        joinedAs: { first_name: "Mary Ann", last_name: "Smith" },
      }),
    ).toEqual({ first_name: "Mary Ann", last_name: "Smith" });
  });

  it("knows no name from an address, even one that reads like a word", () => {
    expect(
      onboardingName({ displayName: "mgarcia", email: "MGarcia@example.com", joinedAs: null }),
    ).toEqual(nothing);
    expect(
      onboardingName({ displayName: "jdoe84", email: "jdoe84@example.com", joinedAs: null }),
    ).toEqual(nothing);
    expect(onboardingName({ displayName: null, email: null, joinedAs: null })).toEqual(nothing);
  });

  it("keeps a lone name as the first name, to finish by hand", () => {
    expect(
      onboardingName({ displayName: "Cher", email: "c@example.com", joinedAs: null }),
    ).toEqual({ first_name: "Cher", last_name: "" });
  });
});

describe("onboardingOpening", () => {
  const known = { first_name: "Zahra", last_name: "Suleman" };

  it("searches as it opens once both halves are known", () => {
    expect(onboardingOpening({ name: known, treeHasEntries: true })).toBe("search");
  });

  it("asks their name when half of it is missing", () => {
    expect(
      onboardingOpening({ name: { first_name: "Cher", last_name: "" }, treeHasEntries: true }),
    ).toBe("name");
    expect(
      onboardingOpening({ name: { first_name: "", last_name: "" }, treeHasEntries: true }),
    ).toBe("name");
  });

  it("opens on adding themselves on a tree nobody is on yet, name or not", () => {
    expect(onboardingOpening({ name: known, treeHasEntries: false })).toBe("add");
    expect(
      onboardingOpening({ name: { first_name: "", last_name: "" }, treeHasEntries: false }),
    ).toBe("add");
  });
});
