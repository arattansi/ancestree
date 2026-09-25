import { describe, expect, it } from "vitest";

import { emptyPersonValues } from "@/lib/person-schema";
import {
  addedYou,
  enteredLine,
  missesAnything,
  welcomeAsk,
  welcomeAsks,
  welcomeTitle,
  type WelcomeEntry,
} from "@/lib/welcome";

// An entry as a relative adds it with the short form (Step 44), and as
// `loadOwnEntry` hands it to the welcome: names, birth, no photo.
const entry = (over: Partial<WelcomeEntry> = {}): WelcomeEntry => ({
  ...emptyPersonValues,
  first_name: "Nasim",
  last_name: "Rattansi",
  date_of_birth: "1960-03-12",
  place_id_birth: 232422,
  city_of_birth: "Kampala",
  country_of_birth: "Uganda",
  photo_path: null,
  ...over,
});

describe("welcomeAsks", () => {
  it("asks for the photo and whatever else a relative left empty", () => {
    expect(welcomeAsks(entry())).toEqual([
      "middle_name",
      "preferred_name",
      "maiden_name",
      "sex",
      "photo",
    ]);
  });

  it("asks for a birth the relative didn't know", () => {
    expect(
      welcomeAsks(
        entry({
          date_of_birth: "",
          place_id_birth: null,
          city_of_birth: "",
          country_of_birth: "",
        }),
      ),
    ).toContain("date_of_birth");
    expect(
      welcomeAsks(
        entry({ place_id_birth: null, city_of_birth: "", country_of_birth: "" }),
      ),
    ).toContain("place_of_birth");
  });

  it("asks for nothing that's there, a photo included", () => {
    expect(
      welcomeAsks(
        entry({
          middle_name: "Zahra",
          preferred_name: "Nasim",
          maiden_name: "Jaffer",
          sex: "female",
          photo_path: "t/p/photo.jpg",
        }),
      ),
    ).toEqual([]);
  });
});

describe("welcomeTitle", () => {
  it("welcomes them by the name the tree calls them", () => {
    expect(welcomeTitle({ first_name: "Muhammad", preferred_name: "Mo" })).toBe(
      "Welcome, Mo",
    );
    expect(welcomeTitle({ first_name: "Nasim", preferred_name: "" })).toBe(
      "Welcome, Nasim",
    );
  });

  it("still welcomes an entry with no first name to go by", () => {
    expect(welcomeTitle({ first_name: " ", preferred_name: null })).toBe(
      "Welcome",
    );
  });
});

describe("addedYou", () => {
  it("names who put them on the tree", () => {
    expect(addedYou("Aalim Rattansi", "The Rattansi Family")).toBe(
      "Aalim Rattansi added you to The Rattansi Family.",
    );
  });

  it("says only where they are when nobody invited them", () => {
    expect(addedYou(null, "The Rattansi Family")).toBe(
      "You’re on The Rattansi Family.",
    );
  });
});

describe("welcomeAsk", () => {
  it("asks for a photo and the rest in one line", () => {
    expect(welcomeAsk(["maiden_name", "photo"])).toBe(
      "Add a photo and what’s missing.",
    );
  });

  it("asks only for what is missing", () => {
    expect(welcomeAsk(["photo"])).toBe("Add a photo.");
    expect(welcomeAsk(["sex"])).toBe("Add what’s missing.");
  });

  it("never counts a middle or preferred name as missing", () => {
    expect(welcomeAsk(["middle_name", "preferred_name", "photo"])).toBe(
      "Add a photo.",
    );
    expect(welcomeAsk(["middle_name", "preferred_name"])).toBe(
      "Check your details.",
    );
  });

  it("asks for a look when nothing is missing", () => {
    expect(welcomeAsk([])).toBe("Check your details.");
  });
});

describe("missesAnything", () => {
  it("is anything empty past a name to reach for", () => {
    expect(missesAnything(["middle_name", "preferred_name"])).toBe(false);
    expect(missesAnything(["middle_name", "photo"])).toBe(true);
    expect(missesAnything(["sex"])).toBe(true);
    expect(missesAnything([])).toBe(false);
  });
});

describe("enteredLine", () => {
  it("says when and where they were born, as finely as it's known", () => {
    expect(enteredLine({ date_of_birth: "1960-03-12" }, "Kampala, Uganda")).toBe(
      "Born 12 March 1960 in Kampala, Uganda",
    );
    expect(enteredLine({ date_of_birth: "1960-03" }, null)).toBe(
      "Born March 1960",
    );
    expect(enteredLine({ date_of_birth: "1960" }, "")).toBe("Born 1960");
    expect(enteredLine({ date_of_birth: "" }, "Kampala, Uganda")).toBe(
      "Born in Kampala, Uganda",
    );
  });

  it("puts a maiden name first, as it's written", () => {
    expect(
      enteredLine(
        { maiden_name: "Jaffer", date_of_birth: "1960" },
        "Kampala, Uganda",
      ),
    ).toBe("née Jaffer, born 1960 in Kampala, Uganda");
    expect(enteredLine({ maiden_name: " Jaffer " }, null)).toBe("née Jaffer");
  });

  it("is nothing when there's nothing past the name", () => {
    expect(enteredLine({ maiden_name: "", date_of_birth: "" }, null)).toBeNull();
    expect(enteredLine({}, undefined)).toBeNull();
  });
});
