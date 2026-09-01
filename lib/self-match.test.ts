import { describe, expect, it } from "vitest";

import {
  candidateSummary,
  canSearchName,
  matchConfidence,
  normalizeTypedName,
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
