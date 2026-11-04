import { describe, expect, it } from "vitest";

import { deathFields, lifeStatusToast, whatGoes } from "@/lib/life-status";
import {
  emptyPersonValues,
  toPersonPayload,
  type PersonFormValues,
} from "@/lib/person-schema";

const payload = (over: Partial<PersonFormValues>) =>
  toPersonPayload({
    ...emptyPersonValues,
    first_name: "Ada",
    last_name: "Rattansi",
    ...over,
  });

describe("deathFields (Step 218)", () => {
  it("sends a death's date and place, with its precision and circa", () => {
    expect(
      deathFields(
        payload({
          is_deceased: true,
          date_of_death: "1990-05-",
          date_of_death_circa: true,
          place_id_death: 1275339,
          place_of_death: "Mumbai, India",
          // Nothing else on the entry goes with it.
          date_of_birth: "1931-03-05",
        }),
      ),
    ).toEqual({
      date_of_death: "1990-05-01",
      date_of_death_precision: "month",
      date_of_death_circa: "true",
      place_id_death: 1275339,
      place_of_death: "Mumbai, India",
    });
  });

  it("leaves blanks out, and a place's label without its place", () => {
    expect(deathFields(payload({ is_deceased: true }))).toEqual({});
    expect(
      deathFields(payload({ is_deceased: true, place_of_death: "Mumbai" })),
    ).toEqual({});
  });
});

describe("whatGoes", () => {
  const living = { date_of_death: null, place_id_death: null, place_of_death: null };

  it("says which death details go when someone is marked living", () => {
    expect(whatGoes(living)).toBeNull();
    expect(whatGoes({ ...living, date_of_death: "1990-01-01" })).toBe(
      "Their date of death goes.",
    );
    expect(whatGoes({ ...living, place_of_death: "Mumbai" })).toBe(
      "Their place of death goes.",
    );
    expect(
      whatGoes({ date_of_death: "1990-01-01", place_id_death: 1, place_of_death: "Mumbai" }),
    ).toBe("Their date and place of death go.");
  });
});

describe("lifeStatusToast", () => {
  it("says what changed", () => {
    expect(lifeStatusToast("Ada", true, ["is_deceased", "date_of_death"])).toBe(
      "Ada is marked as deceased.",
    );
    expect(lifeStatusToast("Ada", false, ["is_deceased"])).toBe(
      "Ada is marked as living.",
    );
    // Marked deceased meanwhile: only the date was theirs to add.
    expect(lifeStatusToast("Ada", true, ["date_of_death"])).toBe(
      "Added their date of death.",
    );
    expect(lifeStatusToast("Ada", true, [])).toBe(
      "Nothing changed: someone may have just done that.",
    );
  });
});
