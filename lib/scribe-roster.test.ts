import { describe, expect, it } from "vitest";

import {
  buildRoster,
  countryQuery,
  factsPrompt,
  placeQuery,
  proposeFacts,
  storyDate,
  type EntryRights,
  type FactSaid,
  type FactsSaid,
  type FoundPlace,
  type RosterRow,
} from "@/lib/scribe-roster";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function row(n: number, p: Partial<RosterRow>): RosterRow {
  return {
    id: id(n),
    first_name: null,
    middle_name: null,
    preferred_name: null,
    maiden_name: null,
    last_name: null,
    placeholder_number: null,
    sex: null,
    date_of_birth: null,
    date_of_birth_precision: null,
    birth_month: null,
    birth_day: null,
    date_of_birth_circa: false,
    place_id_birth: null,
    city_of_birth: null,
    country_of_birth: null,
    is_deceased: false,
    date_of_death: null,
    date_of_death_precision: null,
    date_of_death_circa: false,
    place_id_death: null,
    place_of_death: null,
    ...p,
  };
}

// Grandfather Hassan and grandmother Shirin; their son Karim; his daughter
// Aliya, who records; Hassan's sister Gulbanu; a placeholder grandchild.
const HASSAN = row(1, {
  first_name: "Hassan",
  last_name: "Jaffer",
  sex: "male",
  date_of_birth: "1931-01-01",
  date_of_birth_precision: "year",
  is_deceased: true,
  date_of_death: "2004-01-01",
  date_of_death_precision: "year",
  place_id_death: 6167865,
  place_of_death: "Toronto, Canada",
});
const SHIRIN = row(2, {
  first_name: "Shirin",
  last_name: "Jaffer",
  maiden_name: "Dhanani",
  sex: "female",
  birth_month: 3,
  birth_day: 5,
});
const KARIM = row(3, {
  first_name: "Karim",
  last_name: "Jaffer",
  sex: "male",
  date_of_birth: "1960-01-01",
  date_of_birth_precision: "year",
  place_id_birth: 184745,
  city_of_birth: "Nairobi",
  country_of_birth: "Kenya",
});
const ALIYA = row(4, { first_name: "Aliya", last_name: "Jaffer", sex: "female" });
const GULBANU = row(5, {
  first_name: "Gulbanu",
  last_name: "Karmali",
  maiden_name: "Jaffer",
  sex: "female",
  date_of_birth: "1934-01-01",
  date_of_birth_precision: "year",
  date_of_birth_circa: true,
});
const PLACEHOLDER = row(6, { placeholder_number: 1 });
const ROWS = [HASSAN, SHIRIN, KARIM, ALIYA, GULBANU, PLACEHOLDER];

const parent = (a: RosterRow, b: RosterRow) => ({ from_person: a.id, to_person: b.id, type: "parent" });
const LINES = [
  { from_person: HASSAN.id, to_person: SHIRIN.id, type: "spouse" },
  parent(HASSAN, KARIM),
  parent(SHIRIN, KARIM),
  parent(KARIM, ALIYA),
  { from_person: HASSAN.id, to_person: GULBANU.id, type: "sibling" },
  parent(ALIYA, PLACEHOLDER),
];

const roster = () => buildRoster({ rows: ROWS, lines: LINES, leafId: HASSAN.id, recorderId: ALIYA.id })!;
const TODAY = new Date("2026-10-13T12:00:00Z");

describe("buildRoster", () => {
  it("starts at the leaf, walks out nearest first, and says how each is related", () => {
    const r = roster();
    expect(r.people.map((p) => [p.ref, p.row.first_name, p.toLeaf, p.toRecorder])).toEqual([
      ["P1", "Hassan", null, "grandfather"],
      ["P2", "Shirin", "wife", "grandmother"],
      ["P3", "Karim", "son", "father"],
      ["P4", "Gulbanu", "sister", "grand-aunt"],
      ["P5", "Aliya", "granddaughter", null],
    ]);
    expect(r.leaf.row.id).toBe(HASSAN.id);
    expect(r.recorder?.ref).toBe("P5");
  });

  it("keeps the recorder when the walk is cut short, and is nothing without the leaf", () => {
    const r = buildRoster({ rows: ROWS, lines: LINES, leafId: HASSAN.id, recorderId: ALIYA.id, max: 2 })!;
    expect(r.people.map((p) => p.row.first_name)).toEqual(["Hassan", "Shirin", "Aliya"]);
    expect(buildRoster({ rows: ROWS, lines: LINES, leafId: PLACEHOLDER.id, recorderId: null })).toBeNull();
  });
});

describe("factsPrompt", () => {
  it("says when, whose leaf, who recorded it, the family, then what was heard", () => {
    const prompt = factsPrompt({ roster: roster(), heard: "dada was born in mombasa", locale: "en-CA", today: TODAY });
    expect(prompt.split("\n")).toEqual([
      "Today is 13 October 2026.",
      "The story is told on P1's leaf: Hassan Jaffer.",
      "P5 (Aliya Jaffer) recorded it.",
      "The phone listened for en-CA.",
      "",
      "<family>",
      "P1 · Hassan Jaffer · male · the leaf · the recorder's grandfather · born 1931 · died 2004 in Toronto, Canada",
      "P2 · Shirin Jaffer née Dhanani · female · the leaf's wife · the recorder's grandmother · born 5 March · living, as far as the tree says",
      "P3 · Karim Jaffer · male · the leaf's son · the recorder's father · born 1960 in Nairobi, Kenya · living, as far as the tree says",
      "P4 · Gulbanu Karmali née Jaffer · female · the leaf's sister · the recorder's grand-aunt · born c. 1934 · living, as far as the tree says",
      "P5 · Aliya Jaffer · female · the leaf's granddaughter · the recorder · born: not on the tree · living, as far as the tree says",
      "</family>",
      "",
      "<heard>",
      "dada was born in mombasa",
      "</heard>",
    ]);
  });

  it("says when it was typed", () => {
    expect(factsPrompt({ roster: roster(), heard: "x", locale: null, today: TODAY })).toContain(
      "It was typed, or dictated with the phone's keyboard.",
    );
  });
});

describe("placeQuery and countryQuery", () => {
  it("asks for the place as said, then its country alone", () => {
    const place = { town: "Dhrol", region: " Gujarat ", country: "India" };
    expect(placeQuery(place)).toBe("Dhrol, Gujarat, India");
    expect(countryQuery(place)).toBe("India");
    expect(countryQuery({ town: null, region: null, country: "India" })).toBeNull();
    expect(placeQuery({ town: " ", region: null, country: null })).toBeNull();
    expect(placeQuery(null)).toBeNull();
  });
});

describe("storyDate", () => {
  const said = (year: number | null, month: number | null = null, day: number | null = null, circa = false) =>
    storyDate({ year, month, day, circa }, TODAY);

  it("keeps as much of a date as was given", () => {
    expect(said(1931)).toEqual({ date: "1931-01-01", precision: "year", month: null, day: null, circa: false });
    expect(said(2004, 3)).toMatchObject({ date: "2004-03-01", precision: "month" });
    expect(said(1960, 6, 5, true)).toMatchObject({ date: "1960-06-05", precision: "day", circa: true });
    expect(said(null, 3, 5)).toEqual({ date: null, precision: "day", month: 3, day: 5, circa: false });
  });

  it("drops what can't be a date, and a day that isn't in its month", () => {
    expect(said(null)).toBeNull();
    expect(said(null, 3)).toBeNull();
    expect(said(999)).toBeNull();
    expect(said(2027)).toBeNull();
    expect(said(2026, 12)).toBeNull();
    expect(said(1931, 13)).toMatchObject({ precision: "year" });
    expect(said(1931, 2, 30)).toMatchObject({ precision: "month" });
  });
});

describe("proposeFacts", () => {
  const MOMBASA: FoundPlace = { id: 186301, city: "Mombasa", country: "Kenya", label: "Mombasa, Kenya" };
  const TORONTO: FoundPlace = { id: 6167865, city: "Toronto", country: "Canada", label: "Toronto, Canada" };
  const KENYA: FoundPlace = { id: 9000007569, city: "", country: "Kenya", label: "Kenya" };
  const PLACES = new Map<string, FoundPlace | null>([
    ["Mombasa, Kenya", MOMBASA],
    ["Toronto, Canada", TORONTO],
    ["Kisumu village, Kenya", null],
    ["Kenya", KENYA],
  ]);
  const EDIT: EntryRights = { canEdit: true, canFill: false, suggestTree: null };
  const everyone = (rights: EntryRights) => new Map(ROWS.map((r) => [r.id, rights]));

  const fact = (p: Partial<FactSaid>): FactSaid => ({
    person: "P1",
    event: "birth",
    year: null,
    month: null,
    day: null,
    circa: false,
    place: null,
    evidence: "he was born there",
    ...p,
  });
  const propose = (facts: FactSaid[], rights = everyone(EDIT), extra: Partial<FactsSaid> = {}) =>
    proposeFacts({
      said: { facts, mentioned: [], new_relatives: [], ...extra },
      roster: roster(),
      rights,
      places: PLACES,
      today: TODAY,
    });

  it("offers a birthplace the tree hasn't got, as an edit, with what it changes", () => {
    const { facts } = propose([fact({ year: 1931, place: { town: "Mombasa", region: null, country: "Kenya" } })]);
    expect(facts).toEqual([
      {
        key: "f1",
        personId: HASSAN.id,
        name: "Hassan Jaffer",
        event: "birth",
        changes: { place_id_birth: 186301, city_of_birth: "Mombasa", country_of_birth: "Kenya" },
        rows: [{ detail: "place_of_birth", label: "Place of birth", from: null, to: "Mombasa, Kenya" }],
        evidence: "he was born there",
        way: "edit",
        treeId: null,
      },
    ]);
  });

  it("offers a date the story knows better, and a different one, but not a rougher or guessed one", () => {
    const month = propose([fact({ event: "death", year: 2004, month: 3 })]).facts;
    expect(month[0].rows).toEqual([
      { detail: "date_of_death", label: "Date of death", from: "2004", to: "March 2004" },
    ]);
    const corrected = propose([fact({ year: 1932 })]).facts;
    expect(corrected[0].rows[0]).toMatchObject({ from: "1931", to: "1932" });
    expect(propose([fact({ year: 1931 })]).facts).toEqual([]);
    expect(propose([fact({ year: 1930, circa: true })]).facts).toEqual([]);
    // A rough date the story gives exactly loses its "c.".
    const exact = propose([fact({ person: "P4", year: 1934 })]).facts;
    expect(exact[0].rows[0]).toMatchObject({ from: "c. 1934", to: "1934" });
  });

  it("completes a birthday the tree keeps without a year", () => {
    const { facts } = propose([fact({ person: "P2", year: 1936 })]);
    expect(facts[0].changes).toMatchObject({
      date_of_birth: "1936-03-05",
      date_of_birth_precision: "day",
      birth_month: null,
      birth_day: null,
    });
    expect(facts[0].rows[0]).toMatchObject({ from: "5 March", to: "5 March 1936" });
  });

  it("marks a death on someone the tree has living, but never on the recorder", () => {
    const { facts } = propose([
      fact({ person: "P4", event: "death", year: 2025, evidence: "she passed away last year" }),
      fact({ person: "P5", event: "death", year: 2025 }),
    ]);
    expect(facts).toHaveLength(1);
    expect(facts[0].changes).toMatchObject({ is_deceased: true, date_of_death: "2025-01-01" });
    expect(facts[0].rows.map((r) => r.label)).toEqual(["Deceased", "Date of death"]);
  });

  it("leaves out the same place, the bare country of a place the tree has, and an impossible date", () => {
    expect(propose([fact({ event: "death", place: { town: "Toronto", region: null, country: "Canada" } })]).facts).toEqual([]);
    expect(propose([fact({ person: "P3", place: { town: null, region: null, country: "Kenya" } })]).facts).toEqual([]);
    expect(propose([fact({ year: 2010 })]).facts).toEqual([]);
  });

  it("falls back to the country where the place itself wasn't found", () => {
    const { facts } = propose([fact({ person: "P4", place: { town: "Kisumu village", region: null, country: "Kenya" } })]);
    expect(facts[0].changes).toEqual({ place_id_birth: 9000007569, city_of_birth: null, country_of_birth: "Kenya" });
  });

  it("offers each the way the member may make it, or not at all", () => {
    const place = { town: "Mombasa", region: null, country: "Kenya" };
    const rights = new Map<string, EntryRights>([
      [HASSAN.id, { canEdit: false, canFill: true, suggestTree: "tree-1" }],
      [SHIRIN.id, { canEdit: false, canFill: true, suggestTree: "tree-1" }],
      [GULBANU.id, { canEdit: false, canFill: false, suggestTree: "tree-1" }],
    ]);
    const { facts } = propose(
      [
        fact({ place }), // Hassan's birthplace is blank: filled in.
        fact({ event: "death", year: 2004, month: 3 }), // His death date isn't: suggested.
        fact({ person: "P2", event: "death", year: 2015 }), // Marking a death is never a fill.
        fact({ person: "P4", place }), // Only suggested.
        fact({ person: "P3", year: 1960, month: 6 }), // Karim: no rights, no offer.
      ],
      rights,
    );
    expect(facts.map((f) => [f.name, f.event, f.way, f.treeId])).toEqual([
      ["Hassan Jaffer", "birth", "fill", null],
      ["Hassan Jaffer", "death", "suggest", "tree-1"],
      ["Shirin Jaffer", "death", "suggest", "tree-1"],
      ["Gulbanu Karmali", "birth", "suggest", "tree-1"],
    ]);
  });

  it("offers a person's birth once, and nothing for a code that isn't on the list", () => {
    const { facts } = propose([fact({ year: 1932 }), fact({ year: 1933 }), fact({ person: "P9", year: 1900 })]);
    expect(facts).toHaveLength(1);
    expect(facts[0].rows[0].to).toBe("1932");
  });

  it("offers who it mentions, once each, never the leaf", () => {
    const { mentions } = propose([], everyone(EDIT), { mentioned: ["P1", "P3", " P3", "P4", "P8"] });
    expect(mentions).toEqual([
      { personId: KARIM.id, name: "Karim Jaffer" },
      { personId: GULBANU.id, name: "Gulbanu Karmali" },
    ]);
  });

  it("lists relatives it names who aren't on the tree, but not the unnamed or the known", () => {
    const relative = {
      evidence: "her younger brother Rahim",
      first_name: "Rahim",
      last_name: null,
      sex: "male" as const,
      relation: "sibling" as const,
      of: "P2",
      has_died: false,
      born_year: 1938,
      born_circa: true,
      born_place: { town: "Mombasa", region: null, country: "Kenya" },
      died_year: null,
      died_circa: false,
    };
    const { relatives } = propose([], everyone(EDIT), {
      new_relatives: [
        relative,
        { ...relative, first_name: null, evidence: "a brother who went to Burma" },
        { ...relative, first_name: "Gulbanu", last_name: "Jaffer", relation: "sibling", of: "P1" },
        { ...relative, of: "P9" },
      ],
    });
    expect(relatives).toEqual([
      {
        key: "r1",
        firstName: "Rahim",
        lastName: null,
        sex: "male",
        relation: "sibling",
        ofId: SHIRIN.id,
        ofName: "Shirin Jaffer",
        born: "c. 1938, Mombasa, Kenya",
        died: false,
        diedWhen: null,
        evidence: "her younger brother Rahim",
        bornYear: { year: 1938, circa: true },
        bornPlace: { id: 186301, city: "Mombasa", country: "Kenya" },
        diedYear: null,
      },
    ]);
  });

  it("keeps a relative's years as the story gave them, but not a death before the birth or a year to come", () => {
    const base = {
      evidence: "his father Ali died in 1950",
      first_name: "Ali",
      last_name: "Jaffer",
      sex: "male" as const,
      relation: "parent" as const,
      of: "P1",
      has_died: true,
      born_year: 1890,
      born_circa: true,
      born_place: null,
      died_year: 1950,
      died_circa: false,
    };
    const [ali, early, later] = propose([], everyone(EDIT), {
      new_relatives: [
        base,
        { ...base, first_name: "Abbas", died_year: 1880 },
        { ...base, first_name: "Amin", born_year: 2030, died_year: null },
      ],
    }).relatives;
    expect(ali).toMatchObject({
      born: "c. 1890",
      died: true,
      diedWhen: "1950",
      bornYear: { year: 1890, circa: true },
      bornPlace: null,
      diedYear: { year: 1950, circa: false },
    });
    expect(early).toMatchObject({ died: true, diedWhen: null, diedYear: null });
    expect(later).toMatchObject({ born: null, bornYear: null, died: true });
  });
});
