import { describe, expect, it } from "vitest";

import {
  birthPlaceLabel,
  entryEditChanges,
  entryEditOf,
  entryEditProblems,
  type EntryEdit,
  type EntryRow,
} from "@/lib/entry-edit";
import { personSchema, toPersonPayload, emptyPersonValues } from "@/lib/person-schema";

const ROW: EntryRow = {
  id: "p1",
  first_name: "Noorbanu",
  middle_name: null,
  preferred_name: null,
  maiden_name: "Jiwa",
  last_name: "Kassum",
  sex: "female",
  date_of_birth: "1931-03-01",
  date_of_birth_precision: "month",
  birth_month: null,
  birth_day: null,
  date_of_birth_circa: false,
  city_of_birth: "Zanzibar",
  country_of_birth: "Tanzania",
  is_deceased: false,
  date_of_death: null,
  date_of_death_precision: null,
  date_of_death_circa: null,
  place_of_death: null,
  place_of_residence: "Vancouver, BC, Canada",
  placeholder_number: null,
};

const edit = (patch: Partial<EntryEdit> = {}): EntryEdit => ({ ...entryEditOf(ROW), ...patch });

describe("entryEditOf", () => {
  it("opens a stored entry as the web's form does", () => {
    expect(entryEditOf(ROW)).toEqual({
      firstName: "Noorbanu",
      middleName: "",
      preferredName: "",
      maidenName: "Jiwa",
      lastName: "Kassum",
      sex: "female",
      born: "1931-03",
      bornCirca: false,
      died: false,
      death: "",
      deathCirca: false,
    });
  });

  it("opens a birthday without its year, and drops a sex it doesn't know", () => {
    const opened = entryEditOf({
      ...ROW,
      date_of_birth: null,
      birth_month: 3,
      birth_day: 5,
      sex: "unknown",
    });
    expect(opened.born).toBe("-03-05");
    expect(opened.sex).toBeNull();
  });

  it("labels the place of birth from its town and country", () => {
    expect(birthPlaceLabel(ROW)).toBe("Zanzibar, Tanzania");
    expect(birthPlaceLabel({ city_of_birth: null, country_of_birth: "Kenya" })).toBe("Kenya");
  });
});

describe("entryEditProblems", () => {
  it("passes a stored entry as it is", () => {
    expect(entryEditProblems(edit())).toEqual({});
  });

  it("asks for a first or preferred name and a last name", () => {
    expect(entryEditProblems(edit({ firstName: " ", lastName: "" }))).toEqual({
      name: "Enter a first name or a preferred name.",
      lastName: "Last name is required.",
    });
    expect(entryEditProblems(edit({ firstName: "", preferredName: "Banu" }))).toEqual({});
  });

  it("checks dates as the web does", () => {
    expect(entryEditProblems(edit({ born: "31" })).born).toBe("Use a 4-digit year.");
    expect(entryEditProblems(edit({ born: "-03-05", bornCirca: true })).born).toBe(
      "Add the year, or untick circa.",
    );
    expect(entryEditProblems(edit({ died: true, death: "-03-05" })).death).toBe(
      "Add the year.",
    );
    expect(entryEditProblems(edit({ died: true, death: "1930" })).death).toBe(
      "Date of death can't be before the date of birth.",
    );
    // As finely as the vaguer of the two is known.
    expect(entryEditProblems(edit({ died: true, death: "1931" }))).toEqual({});
  });

  it("leaves a date of death alone while they're living", () => {
    expect(entryEditProblems(edit({ died: false, death: "1930" }))).toEqual({});
  });
});

describe("entryEditChanges", () => {
  it("writes what the web's payload writes for the same fields", () => {
    const values = {
      ...emptyPersonValues,
      first_name: " Noorbanu ",
      maiden_name: "Jiwa",
      last_name: "Kassum ",
      sex: "female" as const,
      date_of_birth: "1931-03",
      date_of_birth_circa: true,
      is_deceased: true,
      date_of_death: "2001-07-04",
    };
    expect(personSchema.safeParse(values).success).toBe(true);
    const web = toPersonPayload(values);
    const phone = entryEditChanges(
      edit({
        firstName: " Noorbanu ",
        lastName: "Kassum ",
        bornCirca: true,
        died: true,
        death: "2001-07-04",
      }),
    );
    for (const [column, value] of Object.entries(phone)) {
      if (column === "place_id_residence" || column === "place_of_residence") continue;
      expect([column, value]).toEqual([column, web[column as keyof typeof web]]);
    }
  });

  it("writes only the places changed, and clears one taken away", () => {
    const untouched = entryEditChanges(edit());
    expect(untouched).not.toHaveProperty("place_id_birth");
    expect(untouched).not.toHaveProperty("place_of_residence");

    const moved = entryEditChanges(edit(), {
      birth: { id: 7, city: "Mombasa", country: "Kenya", label: "Mombasa, Kenya" },
      residence: null,
    });
    expect(moved).toMatchObject({
      place_id_birth: 7,
      city_of_birth: "Mombasa",
      country_of_birth: "Kenya",
      place_id_residence: null,
      place_of_residence: null,
    });

    const country = entryEditChanges(edit(), {
      birth: { id: 9, city: "", country: "Kenya", label: "Kenya" },
    });
    expect(country).toMatchObject({ city_of_birth: null, country_of_birth: "Kenya" });
    expect(entryEditChanges(edit(), { birth: null })).toMatchObject({
      place_id_birth: null,
      city_of_birth: null,
      country_of_birth: "",
    });
  });

  it("keeps a place of death for the dead and where they live for the living", () => {
    const place = { id: 3, city: "Nairobi", country: "Kenya", label: "Nairobi, Kenya" };
    expect(entryEditChanges(edit({ died: false }), { death: place, residence: place })).toMatchObject({
      place_id_death: null,
      place_of_death: null,
      place_id_residence: 3,
      place_of_residence: "Nairobi, Kenya",
    });
    expect(
      entryEditChanges(edit({ died: true, death: "2001" }), { death: place, residence: place }),
    ).toMatchObject({
      place_id_death: 3,
      place_of_death: "Nairobi, Kenya",
      place_id_residence: null,
      place_of_residence: null,
      date_of_death: "2001-01-01",
      date_of_death_precision: "year",
    });
  });

  it("stores a birthday without its year in its own columns", () => {
    expect(entryEditChanges(edit({ born: "-03-05", bornCirca: true }))).toMatchObject({
      date_of_birth: null,
      birth_month: 3,
      birth_day: 5,
      date_of_birth_circa: false,
    });
  });
});
