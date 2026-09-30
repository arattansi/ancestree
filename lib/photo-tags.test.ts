import { describe, expect, it } from "vitest";

import { takenProblem } from "@/lib/album-taken";
import type { PhotoName } from "@/lib/photo-metadata";
import {
  bornYear,
  lifeAt,
  matchName,
  nameKey,
  rankByTaken,
  suggestTags,
  type TagOption,
  type TagPerson,
} from "@/lib/photo-tags";

function person(p: Partial<TagPerson>): TagPerson {
  return {
    first: null,
    middle: null,
    preferred: null,
    last: null,
    maiden: null,
    born: null,
    bornPrecision: "day",
    bornCirca: false,
    died: null,
    diedPrecision: "day",
    diedCirca: false,
    deceased: false,
    ...p,
  };
}

function option(id: string, p: Partial<TagPerson>): TagOption {
  const tp = person(p);
  return { id, label: [tp.preferred || tp.first, tp.last].filter(Boolean).join(" "), person: tp };
}

const region = (name: string): PhotoName => ({ name, source: "region" });
const keyword = (name: string): PhotoName => ({ name, source: "keyword" });

describe("nameKey", () => {
  it("compares names without case, accents, punctuation or brackets", () => {
    expect(nameKey("José  Núñez-Ruiz")).toBe("jose nunez ruiz");
    expect(nameKey("O’Brien, Mary")).toBe("mary obrien");
    expect(nameKey("Fatima (Nani) Jaffer")).toBe("fatima jaffer");
    expect(nameKey(null)).toBe("");
  });
});

describe("matchName", () => {
  const jane = person({ first: "Jane", middle: "Mary Anne", last: "Doe", maiden: "Smith", preferred: "Janie" });
  it("matches a given name and a family name, with middle names or initials between", () => {
    expect(matchName("Jane Doe", jane)).toBe("full");
    expect(matchName("Doe, Jane", jane)).toBe("full");
    expect(matchName("JANE M. A. DOE", jane)).toBe("full");
    expect(matchName("Jane Mary Doe", jane)).toBe("full");
    expect(matchName("Jane Smith", jane)).toBe("full");
    expect(matchName("Janie Doe", jane)).toBe("full");
  });
  it("matches a given name alone as only that", () => {
    expect(matchName("Jane", jane)).toBe("given");
    expect(matchName("janie", jane)).toBe("given");
  });
  it("matches nothing else", () => {
    expect(matchName("Jane Peters Doe", jane)).toBeNull();
    expect(matchName("Doe", jane)).toBeNull();
    expect(matchName("Mary Doe", jane)).toBeNull();
    expect(matchName("Jane Does", jane)).toBeNull();
    expect(matchName("", jane)).toBeNull();
  });
});

describe("lifeAt", () => {
  it("says who was certainly alive, certainly not, or can't say", () => {
    const born1950 = person({ born: "1950-04-02" });
    expect(lifeAt(born1950, "1962")).toBe("alive");
    expect(lifeAt(born1950, "1950")).toBe("unknown");
    expect(lifeAt(born1950, "1950-05")).toBe("alive");
    expect(lifeAt(born1950, "1949-12-31")).toBe("not");
    expect(lifeAt(person({ born: "1970-01-01", bornPrecision: "year" }), "1962")).toBe("not");
    const died = person({ born: "1900-01-01", deceased: true, died: "1955-06-01", diedPrecision: "month" });
    expect(lifeAt(died, "1962")).toBe("not");
    expect(lifeAt(died, "1940")).toBe("alive");
    expect(lifeAt(person({ born: "1900-01-01", deceased: true }), "1940")).toBe("unknown");
    expect(lifeAt(person({}), "1940")).toBe("unknown");
    // "c. 1960" could be 1955 to 1965.
    expect(lifeAt(person({ born: "1960-01-01", bornPrecision: "year", bornCirca: true }), "1962")).toBe("unknown");
    expect(lifeAt(person({ born: "1960-01-01", bornPrecision: "year", bornCirca: true }), "1970")).toBe("alive");
  });
});

describe("suggestTags", () => {
  const grandad = option("grandad", { first: "Ali", last: "Rattansi", born: "1920-01-01", bornPrecision: "year", deceased: true, died: "1990-01-01", diedPrecision: "year" });
  const grandson = option("grandson", { first: "Ali", last: "Rattansi", born: "1995-05-05" });
  const fatima = option("fatima", { first: "Fatima", last: "Rattansi", maiden: "Jaffer", born: "1925-01-01", bornPrecision: "year" });
  const zainab = option("zainab", { first: "Zainab", last: "Rattansi", born: "1950-01-01" });
  const zainab2 = option("zainab2", { first: "Zainab", last: "Hirji", born: "1990-01-01" });
  const hidden: TagOption = { id: "hidden", label: "Someone" };
  const all = [grandad, grandson, fatima, zainab, zainab2, hidden];

  it("suggests whoever has a full name, once each, in the photo's order", () => {
    expect(
      suggestTags([region("Fatima Jaffer"), keyword("Zainab Rattansi"), keyword("fatima rattansi")], all, null),
    ).toEqual(["fatima", "zainab"]);
  });

  it("keeps those alive when it was taken first where a name fits several", () => {
    expect(suggestTags([region("Ali Rattansi")], all, "1962")).toEqual(["grandad"]);
    expect(suggestTags([region("Ali Rattansi")], all, "2010-08")).toEqual(["grandson"]);
    expect(suggestTags([region("Ali Rattansi")], all, null)).toEqual(["grandad", "grandson"]);
  });

  it("never leaves out the one person a name fits for their dates (a scan's date)", () => {
    expect(suggestTags([region("Fatima Jaffer")], all, "1901")).toEqual(["fatima"]);
  });

  it("takes a given name alone only from a face or a People keyword, for one person", () => {
    expect(suggestTags([region("Fatima")], all, null)).toEqual(["fatima"]);
    expect(suggestTags([keyword("Fatima")], all, null)).toEqual([]);
    expect(suggestTags([{ name: "Zainab", source: "people" }], all, null)).toEqual([]);
    expect(suggestTags([{ name: "Zainab", source: "people" }], all, "1970")).toEqual(["zainab"]);
  });

  it("matches nobody the tree doesn't show by name", () => {
    expect(suggestTags([region("Someone")], all, null)).toEqual([]);
  });
});

describe("rankByTaken", () => {
  it("puts those alive when it was taken first, those who can't have been in it last", () => {
    const a = option("a", { first: "A", born: "2000-01-01" });
    const b = option("b", { first: "B", born: "1900-01-01", deceased: true, died: "1950-01-01" });
    const c = option("c", { first: "C", born: "1940-01-01" });
    const d: TagOption = { id: "d", label: "D" };
    expect(rankByTaken([a, b, c, d], "1962").map((o) => o.id)).toEqual(["c", "d", "a", "b"]);
    expect(rankByTaken([a, b, c, d], null).map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("bornYear", () => {
  it("tells two of one name apart", () => {
    expect(bornYear(person({ born: "1920-03-01" }))).toBe("b. 1920");
    expect(bornYear(person({ born: "1920-01-01", bornCirca: true }))).toBe("b. c. 1920");
    expect(bornYear(person({}))).toBeNull();
    expect(bornYear(undefined)).toBeNull();
  });
});

describe("takenProblem", () => {
  const today = new Date(2026, 8, 30);
  it("takes a whole date, a month or a year, up to today", () => {
    expect(takenProblem("", today)).toBeNull();
    expect(takenProblem("1962", today)).toBeNull();
    expect(takenProblem("1962-03", today)).toBeNull();
    expect(takenProblem("1962-03-05", today)).toBeNull();
    expect(takenProblem("2026-10-01", today)).toBeNull();
  });
  it("says what's wrong otherwise", () => {
    expect(takenProblem("2026-10-02", today)).toBe("That’s after today.");
    expect(takenProblem("2026-11", today)).toBe("That’s after today.");
    expect(takenProblem("1962-02-30", today)).toBe("That day isn't in that month.");
    expect(takenProblem("-03-05", today)).toBe("Add the year.");
  });
});
