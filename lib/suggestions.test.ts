import { describe, expect, it } from "vitest";

import { emptyPersonValues, toPersonPayload } from "@/lib/person-schema";
import {
  SUGGESTION_DETAILS,
  answeredLine,
  asSuggestionColumns,
  describeDetail,
  suggestionRows,
  suggestionValues,
  withChanges,
  type SuggestionColumns,
} from "@/lib/suggestions";

/** An entry's columns, as the tree hands them on. */
const entry = (over: SuggestionColumns = {}): SuggestionColumns => ({
  first_name: "Amarshi",
  middle_name: null,
  preferred_name: null,
  maiden_name: null,
  last_name: "Sayani",
  sex: "male",
  date_of_birth: "1931-03-05",
  date_of_birth_precision: "day",
  birth_month: null,
  birth_day: null,
  place_id_birth: 1269321,
  city_of_birth: "Jamnagar",
  country_of_birth: "India",
  is_deceased: true,
  date_of_death: "1999-01-01",
  date_of_death_precision: "year",
  place_id_death: null,
  place_of_death: null,
  ...over,
});

describe("SUGGESTION_DETAILS", () => {
  it("offers a person's details, not their photo, lineage or contact details", () => {
    const columns = SUGGESTION_DETAILS.flatMap((d) => d.columns);
    expect(new Set(columns).size).toBe(columns.length);
    for (const left of [
      "photo_path",
      "photo_crop",
      "lineage_type",
      "email",
      "email_visible",
      "tree_id",
      "owner_user_id",
    ]) {
      expect(columns).not.toContain(left);
    }
  });

  it("keeps a date with its precision and circa, and a place with its labels", () => {
    const columnsOf = (key: string) =>
      SUGGESTION_DETAILS.find((d) => d.key === key)?.columns;
    expect(columnsOf("date_of_birth")).toEqual([
      "date_of_birth",
      "date_of_birth_precision",
      "birth_month",
      "birth_day",
      "date_of_birth_circa",
    ]);
    expect(columnsOf("place_of_birth")).toEqual([
      "place_id_birth",
      "city_of_birth",
      "country_of_birth",
    ]);
    expect(columnsOf("date_of_death")).toEqual([
      "date_of_death",
      "date_of_death_precision",
      "date_of_death_circa",
    ]);
    expect(columnsOf("place_of_death")).toEqual([
      "place_id_death",
      "place_of_death",
    ]);
  });
});

describe("suggestionValues", () => {
  it("sends every detail the form holds, as columns", () => {
    const values = suggestionValues(
      toPersonPayload({
        ...emptyPersonValues,
        first_name: " Amarshi ",
        last_name: "Sayani",
        date_of_birth: "1931-03",
        email: "someone@example.com",
        lineage_type: "adoptive",
      }),
    );
    expect(Object.keys(values).sort()).toEqual(
      SUGGESTION_DETAILS.flatMap((d) => d.columns).sort(),
    );
    expect(values).toMatchObject({
      first_name: "Amarshi",
      middle_name: null,
      last_name: "Sayani",
      date_of_birth: "1931-03-01",
      date_of_birth_precision: "month",
      country_of_birth: "",
      is_deceased: false,
    });
  });

  it("sends whether each date is circa (Step 81)", () => {
    const values = suggestionValues(
      toPersonPayload({
        ...emptyPersonValues,
        first_name: "Amarshi",
        last_name: "Sayani",
        date_of_birth: "1931",
        date_of_birth_circa: true,
      }),
    );
    expect(values).toMatchObject({
      date_of_birth: "1931-01-01",
      date_of_birth_circa: true,
      date_of_death_circa: false,
    });
  });

  it("sends a birthday without its year as a day and month", () => {
    const values = suggestionValues(
      toPersonPayload({
        ...emptyPersonValues,
        first_name: "Amarshi",
        last_name: "Sayani",
        date_of_birth: "-03-12",
      }),
    );
    expect(values).toMatchObject({
      date_of_birth: null,
      birth_month: 3,
      birth_day: 12,
    });
  });
});

describe("describeDetail", () => {
  it("reads each detail the way the details show it", () => {
    const e = entry();
    expect(describeDetail("first_name", e)).toBe("Amarshi");
    expect(describeDetail("middle_name", e)).toBeNull();
    expect(describeDetail("sex", e)).toBe("Male");
    expect(describeDetail("date_of_birth", e)).toBe("5 March 1931");
    expect(describeDetail("place_of_birth", e)).toBe("Jamnagar, India");
    expect(describeDetail("is_deceased", e)).toBe("Yes");
    expect(describeDetail("date_of_death", e)).toBe("1999");
    expect(describeDetail("place_of_death", e)).toBeNull();
  });

  it("reads a birthday kept without its year, and a place with no city", () => {
    const e = entry({
      date_of_birth: null,
      birth_month: 3,
      birth_day: 12,
      city_of_birth: null,
      is_deceased: false,
    });
    expect(describeDetail("date_of_birth", e)).toBe("12 March");
    expect(describeDetail("place_of_birth", e)).toBe("India");
    expect(describeDetail("is_deceased", e)).toBe("No");
  });

  it("says nothing for what isn't there or isn't one", () => {
    expect(describeDetail("sex", entry({ sex: "other" }))).toBeNull();
    expect(describeDetail("sex", {})).toBeNull();
    expect(describeDetail("is_deceased", {})).toBeNull();
    expect(
      describeDetail("place_of_birth", {
        city_of_birth: "  ",
        country_of_birth: "",
      }),
    ).toBeNull();
  });
});

describe("suggestionRows", () => {
  it("shows each detail a suggestion changes, from what it says to what's suggested", () => {
    const changes = {
      date_of_birth: "1931-03-12",
      date_of_birth_precision: "day",
      birth_month: null,
      birth_day: null,
      place_id_birth: 1269743,
      city_of_birth: "Kalavad",
      country_of_birth: "India",
    };
    expect(suggestionRows(changes, entry())).toEqual([
      {
        detail: "date_of_birth",
        label: "Date of birth",
        from: "5 March 1931",
        to: "12 March 1931",
      },
      {
        detail: "place_of_birth",
        label: "Place of birth",
        from: "Jamnagar, India",
        to: "Kalavad, India",
      },
    ]);
  });

  it("shows a detail filled in, and one taken away", () => {
    expect(
      suggestionRows(
        { middle_name: "Jiwan", maiden_name: null },
        entry({ maiden_name: "Rattansi" }),
      ),
    ).toEqual([
      { detail: "middle_name", label: "Middle name", from: null, to: "Jiwan" },
      {
        detail: "maiden_name",
        label: "Maiden name",
        from: "Rattansi",
        to: null,
      },
    ]);
  });

  it("shows a date made circa (Step 81)", () => {
    expect(
      suggestionRows(
        { date_of_death_circa: true },
        entry({ date_of_death_circa: false }),
      ),
    ).toEqual([
      {
        detail: "date_of_death",
        label: "Date of death",
        from: "1999",
        to: "c. 1999",
      },
    ]);
  });

  it("shows someone marked as having died, with the date", () => {
    const rows = suggestionRows(
      {
        is_deceased: true,
        date_of_death: "2001-06-01",
        date_of_death_precision: "month",
      },
      entry({ is_deceased: false, date_of_death: null }),
    );
    expect(rows.map((r) => [r.label, r.from, r.to])).toEqual([
      ["Deceased", "No", "Yes"],
      ["Date of death", null, "June 2001"],
    ]);
  });

  it("leaves out a detail the entry has come to read the same way", () => {
    const changes = {
      date_of_birth: "1931-03-12",
      date_of_birth_precision: "day",
      birth_month: null,
      birth_day: null,
      sex: "female",
    };
    const since = entry({ date_of_birth: "1931-03-12" });
    expect(suggestionRows(changes, since).map((r) => r.detail)).toEqual([
      "sex",
    ]);
    expect(suggestionRows({ sex: "male" }, entry())).toEqual([]);
  });

  it("reads against what the entry said when that's all there is", () => {
    const before = { first_name: "Amarshi" };
    expect(suggestionRows({ first_name: "Amarsi" }, before)).toEqual([
      {
        detail: "first_name",
        label: "First name",
        from: "Amarshi",
        to: "Amarsi",
      },
    ]);
  });
});

describe("withChanges", () => {
  it("lays a suggestion's columns over the entry's", () => {
    const e = entry();
    const next = withChanges(e, {
      date_of_birth: null,
      birth_month: 3,
      birth_day: 12,
    });
    expect(next).toMatchObject({
      first_name: "Amarshi",
      date_of_birth: null,
      birth_month: 3,
      birth_day: 12,
    });
    expect(e.date_of_birth).toBe("1931-03-05");
  });

  it("ignores anything that isn't a detail a suggestion changes", () => {
    const next = withChanges(entry(), {
      photo_path: "x.jpg",
    } as unknown as SuggestionColumns);
    expect(next).not.toHaveProperty("photo_path");
  });
});

describe("asSuggestionColumns", () => {
  it("keeps the columns a suggestion holds and drops the rest", () => {
    expect(
      asSuggestionColumns({ first_name: "A", email: "x@example.com" }),
    ).toEqual({ first_name: "A" });
    expect(asSuggestionColumns(null)).toEqual({});
    expect(asSuggestionColumns(["first_name"])).toEqual({});
    expect(asSuggestionColumns("first_name")).toEqual({});
  });
});

describe("answeredLine", () => {
  it("says who answered", () => {
    expect(answeredLine({ status: "accepted", decidedBy: "Aalim Rattansi" })).toBe(
      "Accepted by Aalim Rattansi.",
    );
    expect(answeredLine({ status: "declined", decidedBy: null })).toBe(
      "Declined.",
    );
  });

  it("quotes why it was declined (Step 69)", () => {
    expect(
      answeredLine({
        status: "declined",
        decidedBy: "Aalim Rattansi",
        declineReason: "  Her passport says the 5th. ",
      }),
    ).toBe("Declined by Aalim Rattansi: “Her passport says the 5th.”");
    expect(
      answeredLine({ status: "declined", decidedBy: null, declineReason: " " }),
    ).toBe("Declined.");
  });

  it("never gives a reason for accepting one", () => {
    expect(
      answeredLine({
        status: "accepted",
        decidedBy: null,
        declineReason: "stale",
      }),
    ).toBe("Accepted.");
  });
});
