import { describe, expect, it } from "vitest";

import {
  blankFields,
  fillFields,
  filledPhrase,
  type FillableEntry,
} from "@/lib/fill-blanks";
import { emptyPersonValues, toPersonPayload } from "@/lib/person-schema";

const entry = (over: Partial<FillableEntry> = {}): FillableEntry => ({
  first_name: "Roshen",
  middle_name: null,
  preferred_name: null,
  maiden_name: null,
  sex: null,
  date_of_birth: null,
  place_id_birth: null,
  city_of_birth: null,
  country_of_birth: "",
  is_deceased: false,
  date_of_death: null,
  place_id_death: null,
  place_of_death: null,
  photo_path: null,
  ...over,
});

describe("blankFields", () => {
  it("lists what an entry added with just a name is missing", () => {
    expect(blankFields(entry())).toEqual([
      "middle_name",
      "preferred_name",
      "maiden_name",
      "sex",
      "date_of_birth",
      "place_of_birth",
      "photo",
    ]);
  });

  it("counts a blank name as missing, and a filled one as there", () => {
    const nana = entry({ first_name: "  ", preferred_name: "Nana" });
    expect(blankFields(nana)).toContain("first_name");
    expect(blankFields(nana)).not.toContain("preferred_name");
  });

  it("asks death details only of someone marked as having died", () => {
    expect(blankFields(entry())).not.toContain("date_of_death");
    const died = blankFields(entry({ is_deceased: true }));
    expect(died).toContain("date_of_death");
    expect(died).toContain("place_of_death");
    const known = blankFields(
      entry({ is_deceased: true, date_of_death: "1990-01-01", place_of_death: "Mombasa, Kenya" }),
    );
    expect(known).not.toContain("date_of_death");
    expect(known).not.toContain("place_of_death");
  });

  it("treats an older free-text birthplace as filled in", () => {
    expect(blankFields(entry({ country_of_birth: "Kenya" }))).not.toContain(
      "place_of_birth",
    );
    expect(blankFields(entry({ city_of_birth: "Nairobi" }))).not.toContain(
      "place_of_birth",
    );
    expect(blankFields(entry({ place_id_birth: 184745 }))).not.toContain(
      "place_of_birth",
    );
  });

  it("offers a photo only where there's none", () => {
    expect(blankFields(entry({ photo_path: "t/p/a.jpg" }))).not.toContain(
      "photo",
    );
  });
});

describe("fillFields", () => {
  const payload = (over: Partial<typeof emptyPersonValues> = {}) =>
    toPersonPayload({
      ...emptyPersonValues,
      first_name: "Roshen",
      last_name: "Suleman",
      ...over,
    });

  it("sends only what the form holds, never a blank", () => {
    expect(fillFields(payload({ maiden_name: " ", sex: "female" }))).toEqual({
      first_name: "Roshen",
      sex: "female",
    });
  });

  it("sends a date with its precision", () => {
    expect(fillFields(payload({ date_of_birth: "1931" }))).toMatchObject({
      date_of_birth: "1931-01-01",
      date_of_birth_precision: "year",
    });
  });

  it("sends a birthplace with the city and country it was picked with", () => {
    const fields = fillFields(
      payload({
        place_id_birth: 184745,
        city_of_birth: "Nairobi",
        country_of_birth: "Kenya",
      }),
    );
    expect(fields).toMatchObject({
      place_id_birth: 184745,
      city_of_birth: "Nairobi",
      country_of_birth: "Kenya",
    });
  });

  it("leaves death details out for someone living", () => {
    const fields = fillFields(
      payload({ is_deceased: false, date_of_death: "1990", place_id_death: 1 }),
    );
    expect(fields).not.toHaveProperty("date_of_death");
    expect(fields).not.toHaveProperty("place_id_death");
  });

  it("names an uploaded photo and its framing", () => {
    const crop = { zoom: 1.5, focus_x: 0.5, focus_y: 0.4 };
    expect(
      fillFields(payload(), { path: "tree/person/a.jpg", crop }),
    ).toMatchObject({ photo_path: "tree/person/a.jpg", photo_crop: crop });
  });
});

describe("filledPhrase", () => {
  it("says what was filled in, in the form's order", () => {
    expect(filledPhrase(["photo"])).toBe("photo");
    expect(filledPhrase(["photo", "place_of_birth"])).toBe(
      "place of birth and photo",
    );
    expect(filledPhrase(["sex", "photo", "maiden_name"])).toBe(
      "maiden name, sex and photo",
    );
  });

  it("leaves out anything it doesn't know", () => {
    expect(filledPhrase(["photo", "lineage_type"])).toBe("photo");
    expect(filledPhrase([])).toBe("");
  });
});
