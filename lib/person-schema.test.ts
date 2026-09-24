import { describe, expect, it } from "vitest";

import {
  emptyPersonValues,
  personSchema,
  toPersonPayload,
  type PersonFormValues,
} from "./person-schema";

const person = (over: Partial<PersonFormValues> = {}): PersonFormValues => ({
  ...emptyPersonValues,
  first_name: "Roshen",
  last_name: "Suleman",
  place_id_birth: 964137,
  country_of_birth: "South Africa",
  ...over,
});

const deathIssue = (values: PersonFormValues) =>
  personSchema
    .safeParse(values)
    .error?.issues.find((i) => i.path[0] === "date_of_death")?.message;

describe("personSchema requirements", () => {
  it("takes a name alone, with no place of birth (Step 44)", () => {
    const values = person({
      place_id_birth: null,
      country_of_birth: "",
      city_of_birth: "",
    });
    expect(personSchema.safeParse(values).success).toBe(true);
    expect(toPersonPayload(values).country_of_birth).toBe("");
    expect(toPersonPayload(values).place_id_birth).toBeNull();
  });

  it("takes a preferred name in place of a first name", () => {
    const values = person({ first_name: "", preferred_name: "Nana" });
    expect(personSchema.safeParse(values).success).toBe(true);
  });

  it("still asks for a first or preferred name, and a last name", () => {
    const nameless = personSchema.safeParse(
      person({ first_name: " ", preferred_name: "" }),
    );
    expect(nameless.error?.issues[0]?.message).toBe(
      "Enter a first name or a preferred name.",
    );
    const noSurname = personSchema.safeParse(person({ last_name: " " }));
    expect(noSurname.error?.issues[0]?.message).toBe("Last name is required.");
  });
});

describe("personSchema dates", () => {
  it("takes a year, or a month and year, for a date of birth", () => {
    expect(personSchema.safeParse(person({ date_of_birth: "1931" })).success).toBe(true);
    expect(personSchema.safeParse(person({ date_of_birth: "1931-03" })).success).toBe(true);
  });

  it("says what's wrong with a half-typed date", () => {
    const result = personSchema.safeParse(person({ date_of_birth: "1931--3" }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Pick the month, or clear the day.",
    );
  });

  it("allows a death known only to the year of the birth", () => {
    const values = person({
      is_deceased: true,
      date_of_birth: "1990-05-03",
      date_of_death: "1990",
    });
    expect(deathIssue(values)).toBeUndefined();
  });

  it("refuses a death before the birth", () => {
    const values = person({
      is_deceased: true,
      date_of_birth: "1990",
      date_of_death: "1989-12-31",
    });
    expect(deathIssue(values)).toBe(
      "Date of death can't be before the date of birth.",
    );
  });
});

describe("toPersonPayload dates", () => {
  it("stores a partial date on the first day of its period, with its precision", () => {
    const payload = toPersonPayload(
      person({
        is_deceased: true,
        date_of_birth: "1931",
        date_of_death: "2004-06",
      }),
    );
    expect(payload.date_of_birth).toBe("1931-01-01");
    expect(payload.date_of_birth_precision).toBe("year");
    expect(payload.date_of_death).toBe("2004-06-01");
    expect(payload.date_of_death_precision).toBe("month");
  });

  it("clears a living person's death date back to a whole-date default", () => {
    const payload = toPersonPayload(
      person({ is_deceased: false, date_of_death: "2004" }),
    );
    expect(payload.date_of_death).toBeNull();
    expect(payload.date_of_death_precision).toBe("day");
  });

  it("keeps a whole date whole", () => {
    const payload = toPersonPayload(person({ date_of_birth: "1925-09-04" }));
    expect(payload.date_of_birth).toBe("1925-09-04");
    expect(payload.date_of_birth_precision).toBe("day");
  });
});
