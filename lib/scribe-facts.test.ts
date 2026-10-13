import { describe, expect, it } from "vitest";

import {
  factNote,
  factsDone,
  factWrites,
  fillFieldsFor,
  isScribeFacts,
  relativeLine,
  type FactProposal,
  type RelativeProposal,
} from "@/lib/scribe-facts";

const ID = "00000000-0000-4000-8000-000000000001";

const proposal = (p: Partial<FactProposal>): FactProposal => ({
  key: "f1",
  personId: ID,
  name: "Hassan Jaffer",
  event: "birth",
  changes: { place_id_birth: 186301, city_of_birth: "Mombasa", country_of_birth: "Kenya" },
  rows: [{ detail: "place_of_birth", label: "Place of birth", from: null, to: "Mombasa, Kenya" }],
  evidence: "born in Mombasa",
  way: "edit",
  treeId: null,
  ...p,
});

const relative: RelativeProposal = {
  key: "r1",
  firstName: "Rahim",
  lastName: null,
  sex: "male",
  relation: "sibling",
  ofId: ID,
  ofName: "Rehmat Jaffer",
  born: null,
  died: false,
  diedWhen: null,
  evidence: "her younger brother Rahim",
};

describe("isScribeFacts", () => {
  it("takes a whole answer and nothing less", () => {
    expect(isScribeFacts({ facts: [proposal({})], mentions: [{ personId: ID, name: "A" }], relatives: [relative] })).toBe(true);
    expect(isScribeFacts({ facts: [], mentions: [], relatives: [] })).toBe(true);
    expect(isScribeFacts({ facts: [proposal({ way: "suggest", treeId: null })], mentions: [], relatives: [] })).toBe(false);
    expect(isScribeFacts({ facts: [proposal({ way: "guess" as never })], mentions: [], relatives: [] })).toBe(false);
    expect(isScribeFacts({ facts: [], mentions: [] })).toBe(false);
    expect(isScribeFacts(null)).toBe(false);
  });
});

describe("factNote", () => {
  it("names the story and quotes what each detail rests on, once", () => {
    expect(factNote(" The boat ", ["born in Mombasa", " born in Mombasa ", "died in March 2004"])).toBe(
      "From the story “The boat”: “born in Mombasa” “died in March 2004”",
    );
    expect(factNote("", [])).toBe("From the story “Untitled”.");
  });

  it("fits what a suggestion's note may hold", () => {
    const note = factNote("T", ["x".repeat(600)]);
    expect(note).toHaveLength(500);
    expect(note.endsWith("…")).toBe(true);
  });
});

describe("factWrites", () => {
  it("makes a person's details one write a way", () => {
    const writes = factWrites([
      proposal({}),
      proposal({ key: "f2", event: "death", changes: { date_of_death: "2004-03-01" }, evidence: "died in March" }),
      proposal({ key: "f3", personId: "other", name: "Shirin Jaffer", way: "suggest", treeId: "t" }),
    ]);
    expect(writes).toEqual([
      {
        personId: ID,
        name: "Hassan Jaffer",
        way: "edit",
        treeId: null,
        changes: {
          place_id_birth: 186301,
          city_of_birth: "Mombasa",
          country_of_birth: "Kenya",
          date_of_death: "2004-03-01",
        },
        evidence: ["born in Mombasa", "died in March"],
      },
      expect.objectContaining({ personId: "other", way: "suggest", treeId: "t" }),
    ]);
  });
});

describe("fillFieldsFor", () => {
  it("sends what the web's fill form sends: precision with its date, circa only when so, labels with their place", () => {
    expect(
      fillFieldsFor({
        date_of_birth: "1931-01-01",
        date_of_birth_precision: "year",
        birth_month: null,
        birth_day: null,
        date_of_birth_circa: true,
        place_id_birth: 186301,
        city_of_birth: "Mombasa",
        country_of_birth: "Kenya",
      }),
    ).toEqual({
      date_of_birth: "1931-01-01",
      date_of_birth_precision: "year",
      date_of_birth_circa: "true",
      place_id_birth: 186301,
      city_of_birth: "Mombasa",
      country_of_birth: "Kenya",
    });
    expect(fillFieldsFor({ date_of_death: "2004-03-01", date_of_death_precision: "month", date_of_death_circa: false })).toEqual({
      date_of_death: "2004-03-01",
      date_of_death_precision: "month",
    });
    expect(fillFieldsFor({ birth_month: 3, birth_day: 5, date_of_birth: null, date_of_birth_precision: "day" })).toEqual({
      birth_month: 3,
      birth_day: 5,
    });
  });
});

describe("relativeLine", () => {
  it("says who they are to whom, in the word their sex gives", () => {
    expect(relativeLine(relative)).toBe("Rahim, Rehmat Jaffer’s brother");
    expect(relativeLine({ ...relative, sex: null, relation: "parent", lastName: "Merali" })).toBe(
      "Rahim Merali, Rehmat Jaffer’s parent",
    );
  });
});

describe("factsDone", () => {
  it("counts what was made, and says what wasn't", () => {
    expect(factsDone([])).toBeNull();
    expect(
      factsDone([
        { way: "edit", error: null },
        { way: "fill", error: null },
        { way: "suggest", error: null },
      ]),
    ).toBe("2 changes made, 1 suggestion sent.");
    expect(factsDone([{ way: "suggest", error: "That entry isn’t on your tree." }])).toBe(
      "1 couldn’t be made: That entry isn’t on your tree.",
    );
  });
});
