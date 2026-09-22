import { describe, expect, it } from "vitest";

import { canLookUpPlace, landsListParts, parseTerritories } from "./native-land";

// Shaped like NLD's answer to `maps=territories&position=…`: a bare array of
// GeoJSON features, geometry and all.
const feature = (name: unknown, description?: unknown) => ({
  type: "Feature",
  properties: {
    Name: name,
    FrenchName: name,
    Slug: typeof name === "string" ? name.toLowerCase() : "x",
    description,
    FrenchDescription: description,
    color: "#167925",
  },
  geometry: { type: "Polygon", coordinates: [[[-79.4, 43.6]]] },
  id: "155d688cb2e7d81c11de3beee6b60b4a",
});

describe("parseTerritories", () => {
  it("reads each territory's name and its page on native-land.ca", () => {
    expect(
      parseTerritories([
        feature(
          "Bodwéwadmi (Potawatomi)",
          "https://native-land.ca/maps/territories/bodwewadmi-potawatomi/",
        ),
      ]),
    ).toEqual([
      {
        name: "Bodwéwadmi (Potawatomi)",
        url: "https://native-land.ca/maps/territories/bodwewadmi-potawatomi/",
      },
    ]);
  });

  it("sorts by name and keeps one of each", () => {
    const names = parseTerritories([
      feature("Wendake-Nionwentsïo"),
      feature("Anishinabewaki ᐊᓂᔑᓈᐯᐗᑭ"),
      feature("Mississauga"),
      feature("mississauga "),
    ])?.map((t) => t.name);
    expect(names).toEqual([
      "Anishinabewaki ᐊᓂᔑᓈᐯᐗᑭ",
      "Mississauga",
      "Wendake-Nionwentsïo",
    ]);
  });

  it("takes a FeatureCollection as well as a bare array", () => {
    expect(
      parseTerritories({
        type: "FeatureCollection",
        features: [feature("Peoria")],
      }),
    ).toEqual([{ name: "Peoria", url: null }]);
  });

  it("is null for an answer that isn't features, like a key error", () => {
    expect(
      parseTerritories({
        error: "You did not include an API key.",
      }),
    ).toBeNull();
    expect(parseTerritories("nope")).toBeNull();
    expect(parseTerritories(null)).toBeNull();
  });

  it("is empty, not null, where no territory is mapped", () => {
    expect(parseTerritories([])).toEqual([]);
  });

  it("skips features without a usable name", () => {
    expect(
      parseTerritories([feature(""), feature(42), { type: "Feature" }, null]),
    ).toEqual([]);
  });

  it("links only to native-land.ca over https", () => {
    const urls = parseTerritories([
      feature("A", "https://native-land.ca/maps/territories/a/"),
      feature("B", "http://native-land.ca/maps/territories/b/"),
      feature("C", "https://native-land.ca.example.com/c"),
      feature("D", "javascript:alert(1)"),
      feature("E", "not a url"),
    ])?.map((t) => t.url);
    expect(urls).toEqual([
      "https://native-land.ca/maps/territories/a/",
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("canLookUpPlace", () => {
  it("asks about a populated place with coordinates", () => {
    expect(
      canLookUpPlace({ latitude: 43.70011, longitude: -79.4163, feature_class: "P" }),
    ).toBe(true);
  });

  it("won't guess from a region's centroid or a place without coordinates", () => {
    expect(
      canLookUpPlace({ latitude: 49.25, longitude: -84.5, feature_class: "A" }),
    ).toBe(false);
    expect(
      canLookUpPlace({ latitude: null, longitude: null, feature_class: "P" }),
    ).toBe(false);
    expect(
      canLookUpPlace({ latitude: Number.NaN, longitude: 1, feature_class: "P" }),
    ).toBe(false);
  });
});

describe("the list a card shows", () => {
  const list = (...names: string[]) =>
    landsListParts(names)
      .map((part) => part.value)
      .join("");

  it("lists every territory, with a comma before the last", () => {
    expect(list("Haudenosaunee")).toBe("Haudenosaunee");
    expect(list("Haudenosaunee", "Mississauga")).toBe(
      "Haudenosaunee and Mississauga",
    );
    expect(list("Anishinabewaki", "Haudenosaunee", "Wendake-Nionwentsïo")).toBe(
      "Anishinabewaki, Haudenosaunee, and Wendake-Nionwentsïo",
    );
  });

  it("splits the list so each name can be a link", () => {
    expect(landsListParts(["A", "B", "C"])).toEqual([
      { type: "name", value: "A" },
      { type: "literal", value: ", " },
      { type: "name", value: "B" },
      { type: "literal", value: ", and " },
      { type: "name", value: "C" },
    ]);
  });
});
