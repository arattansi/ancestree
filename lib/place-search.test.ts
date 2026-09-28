import { describe, expect, it } from "vitest";

import {
  choosePlaces,
  foldPlaceText,
  rankPlaces,
  shapePlaceQuery,
  type PlaceQuery,
  type PlaceRow,
} from "./place-search";

type Row = PlaceRow & { id: number };

// Rows as `places` holds them (live, 2026-09-28), most populous first — the
// order the search's query returns them in.
const row = (
  id: number,
  name: string,
  admin1_code: string | null,
  country_code: string,
  population: number | null,
  ascii_name = name,
): Row => ({
  id,
  name,
  ascii_name,
  search_name: ascii_name.toLowerCase(),
  admin1_code,
  country_code,
  population,
});

const VANCOUVER = [
  row(6173331, "Vancouver", "02", "CA", 662248),
  row(5814616, "Vancouver", "WA", "US", 196442),
  row(6090785, "North Vancouver", "02", "CA", 88168),
  row(12022702, "Downtown Vancouver", "02", "CA", 62030),
  row(8533869, "West Vancouver", "02", "CA", 45487),
];

const LONDON = [
  row(2643743, "London", "ENG", "GB", 8961989),
  row(1006984, "East London", "05", "ZA", 478676),
  row(6058560, "London", "08", "CA", 422324),
  row(2643734, "Londonderry County Borough", "NIR", "GB", 87153),
  row(4839416, "New London", "CT", "US", 27179),
  row(5088905, "Londonderry", "NH", "US", 11037),
  row(4517009, "London", "OH", "US", 10060),
  row(4298960, "London", "KY", "US", 8126),
  row(2643741, "City of London", "ENG", "GB", 8072),
];

const NAIROBI = [row(184745, "Nairobi", "05", "KE", 4397073)];
const KALAVAD = row(1268450, "Kālāvad", "09", "IN", 28314, "Kalavad");
const STATE_COLLEGE = row(5213681, "State College", "PA", "US", 42161);
const COLLEGE_STATION = row(4682464, "College Station", "TX", "US", 107889);
const MISATO = row(6822137, "Misato, Saitama", "34", "JP", 142145);
const SHISHANG_CN = row(8534429, "Shishang", "03", "CN", 0);
// Added by a Root (Step 64): the state is what they typed, the population unknown.
const SHISHANG_IN = row(10000000000, "Shishang", "Gujarat", "IN", null);

function query(typed: string): PlaceQuery {
  const q = shapePlaceQuery(typed);
  if (!q) throw new Error(`no search for ${JSON.stringify(typed)}`);
  return q;
}

/** What the picker would list: the search as typed finds `found`; its fallback `rescued`. */
function offered(typed: string, found: Row[], rescued: Row[] | null = null): number[] {
  return choosePlaces(query(typed), found, rescued).map((p) => p.id);
}

describe("foldPlaceText", () => {
  it("takes off the accents a label shows, as GeoNames' ascii names do", () => {
    expect(foldPlaceText("Kālāvad")).toBe("kalavad");
    expect(foldPlaceText("Agüimes")).toBe("aguimes");
    expect(foldPlaceText("İstanbul")).toBe("istanbul");
  });

  it("spells out letters that don't come apart from an accent", () => {
    expect(foldPlaceText("Łódź")).toBe("lodz");
    expect(foldPlaceText("Tromsø")).toBe("tromso");
    expect(foldPlaceText("Weinstraße")).toBe("weinstrasse");
  });

  it("makes a phone's curly apostrophe and long dashes plain", () => {
    expect(foldPlaceText("St. John’s")).toBe("st. john's");
    expect(foldPlaceText("Stoke–on‑Trent")).toBe("stoke-on-trent");
  });

  it("drops what ILIKE or PostgREST would read as a wildcard", () => {
    expect(foldPlaceText("van%cou_ver*\\")).toBe("van cou ver");
  });

  it("squeezes spaces", () => {
    expect(foldPlaceText("  Vancouver,   BC ")).toBe("vancouver, bc");
  });
});

describe("shapePlaceQuery", () => {
  it("searches a plain name as before", () => {
    expect(query("London")).toEqual({
      name: "london",
      hints: [],
      within: [],
      whole: "london",
      exact: false,
      fallback: null,
    });
  });

  it("searches only what comes before the first comma", () => {
    // Aalim's searches from 2026-09-28, which all found nothing.
    for (const typed of ["vancouver,", "vancouver, b", "vancouver, br", "vancouver, british"]) {
      expect(query(typed).name).toBe("vancouver");
    }
  });

  it("keeps what follows the comma as region hints", () => {
    expect(query("vancouver, british").hints).toEqual(["british"]);
    expect(query("Vancouver, B.C., Canada").hints).toEqual(["bc", "canada"]);
    // One letter is too little to go on.
    expect(query("vancouver, b").hints).toEqual([]);
  });

  it("joins the parts the way GeoNames writes a name that has a comma", () => {
    expect(query("Misato,Saitama").whole).toBe("misato, saitama");
    expect(query("vancouver,").whole).toBe("vancouver");
  });

  it("falls back to the name without place-kind words", () => {
    expect(query("Kalavad taluka")).toMatchObject({
      name: "kalavad taluka",
      fallback: { name: "kalavad", hints: [], within: [], whole: "kalavad taluka" },
    });
    expect(query("Jamnagar Dist., Gujarat").fallback).toEqual({
      name: "jamnagar",
      hints: ["gujarat"],
      within: [],
      whole: "jamnagar dist., gujarat",
      exact: false,
    });
    // Only if "state college" itself finds nothing (see choosePlaces).
    expect(query("State College").fallback?.name).toBe("college");
  });

  it("falls back to the name without a region named at its end", () => {
    expect(query("Vancouver BC").fallback).toMatchObject({
      name: "vancouver",
      hints: ["bc"],
      within: ["bc"],
    });
    expect(query("Toronto Ontario Canada").fallback).toMatchObject({
      name: "toronto",
      hints: ["ontario", "canada"],
      within: ["ontario", "canada"],
    });
    expect(query("Kalavad taluka Gujarat").fallback).toMatchObject({
      name: "kalavad",
      hints: ["gujarat"],
      within: ["gujarat"],
    });
  });

  it("leaves a region typed on its own alone", () => {
    expect(query("New Jersey").fallback).toBeNull();
    expect(query("British Columbia").fallback).toBeNull();
    expect(query("New York State").fallback).toMatchObject({
      name: "new york",
      hints: [],
      within: [],
    });
  });

  it("spells ä, ö and ü out first, as GeoNames mostly does, and plain after", () => {
    expect(query("Zürich")).toMatchObject({
      name: "zuerich",
      fallback: { name: "zurich", hints: [], within: [] },
    });
    // A name that has one, typed whole with its comma.
    expect(query("Rüti / Dorfzentrum, Südl. Teil").whole).toBe(
      "rueti / dorfzentrum, suedl. teil",
    );
    // Dropping a place-kind word comes first; the spelling stays.
    expect(query("Zürich district").fallback?.name).toBe("zuerich");
  });

  it("matches two letters only as a whole name, three anywhere in one", () => {
    // Anywhere in a name, two letters can't use the trigram index (Step 66.5).
    expect(query("Bo")).toMatchObject({ name: "bo", exact: true, fallback: null });
    expect(query("Ho, Ghana")).toMatchObject({ name: "ho", hints: ["ghana"], exact: true });
    expect(query("Bol")).toMatchObject({ name: "bol", exact: false });
    // A fallback that comes down to two letters is matched whole too.
    expect(query("Ho Ghana")).toMatchObject({
      exact: false,
      fallback: { name: "ho", within: ["ghana"], exact: true },
    });
  });

  it("has nothing to search without two letters before the comma", () => {
    expect(shapePlaceQuery("a")).toBeNull();
    expect(shapePlaceQuery("   ")).toBeNull();
    expect(shapePlaceQuery(", India")).toBeNull();
    expect(shapePlaceQuery("a, India")).toBeNull();
  });
});

describe("rankPlaces", () => {
  const ids = (rows: Row[]) => rows.map((p) => p.id);

  it("ranks a plain name as before: exact, prefix, word, then population", () => {
    expect(ids(rankPlaces(LONDON, query("London")))).toEqual([
      2643743, // London, ENG, United Kingdom
      6058560, // London, Canada
      4517009, // London, OH
      4298960, // London, KY
      2643734, // Londonderry County Borough
      5088905, // Londonderry, NH
      1006984, // East London
      4839416, // New London, CT
      2643741, // City of London
    ]);
  });

  it("ranks every exact namesake first, however far down the rows it comes", () => {
    // Among the most populous "%ely%" matches Ely, NV is the 78th and Ely, MN
    // the 87th: why the search pulls 200 rows, not 60 (Step 66.4).
    const elys = [
      row(1508291, "Chelyabinsk", "13", "RU", 1202371),
      row(5153207, "Elyria", "OH", "US", 53775),
      row(2650023, "Ely", "ENG", "GB", 20574),
      row(5503694, "Ely", "NV", "US", 4134),
      row(5025627, "Ely", "MN", "US", 3408),
    ];
    expect(ids(rankPlaces(elys, query("Ely")))).toEqual([
      2650023, 5503694, 5025627, 5153207, 1508291,
    ]);
  });

  it("puts the obvious city first", () => {
    expect(rankPlaces(LONDON, query("London"))[0].id).toBe(2643743);
    expect(rankPlaces(NAIROBI, query("Nairobi"))[0].id).toBe(184745);
    expect(rankPlaces(VANCOUVER, query("Vancouver, Canada"))[0].id).toBe(6173331);
  });

  it("puts places in the region named after the comma first", () => {
    expect(rankPlaces(LONDON, query("London, Ontario"))[0].id).toBe(6058560);
    expect(rankPlaces(LONDON, query("London, ON"))[0].id).toBe(6058560);
    expect(rankPlaces(LONDON, query("London, Canada"))[0].id).toBe(6058560);
    expect(rankPlaces(LONDON, query("London, KY"))[0].id).toBe(4298960);
    expect(rankPlaces(LONDON, query("London, Kentucky, USA"))[0].id).toBe(4298960);
    expect(rankPlaces(LONDON, query("London, England"))[0].id).toBe(2643743);
    expect(rankPlaces(LONDON, query("London, UK"))[0].id).toBe(2643743);
    expect(rankPlaces(VANCOUVER, query("Vancouver, WA"))[0].id).toBe(5814616);
    expect(rankPlaces(VANCOUVER, query("Vancouver, Washington State"))[0].id).toBe(5814616);
  });

  it("goes by the start of a region's name while it's still being typed", () => {
    expect(ids(rankPlaces(VANCOUVER, query("vancouver, brit")))).toEqual([
      6173331, // Vancouver, Canada
      6090785, // North Vancouver
      12022702, // Downtown Vancouver
      8533869, // West Vancouver
      5814616, // Vancouver, WA
    ]);
  });

  it("changes nothing when the region matches none of the places", () => {
    expect(ids(rankPlaces(VANCOUVER, query("Vancouver, Narnia")))).toEqual(
      ids(rankPlaces(VANCOUVER, query("Vancouver"))),
    );
  });

  it("matches the state a Root typed for a place they added", () => {
    const both = [SHISHANG_CN, SHISHANG_IN];
    expect(rankPlaces(both, query("Shishang"))[0].id).toBe(8534429);
    expect(rankPlaces(both, query("Shishang, Gujarat"))[0].id).toBe(10000000000);
    expect(rankPlaces(both, query("Shishang, India"))[0].id).toBe(10000000000);
  });

  it("puts a name that has a comma in it first when typed whole", () => {
    const misatos = [row(1, "Misato", "13", "JP", 200000), MISATO];
    expect(rankPlaces(misatos, query("Misato, Saitama"))[0].id).toBe(6822137);
  });
});

describe("choosePlaces", () => {
  it("finds a place with a two-letter name", () => {
    const hos = [
      row(2300379, "Ho", "08", "GH", 130701),
      row(8340703, "Hồ", "24", "VN", 0, "Ho"),
    ];
    const bos = [
      row(2410048, "Bo", "03", "SL", 233684),
      row(8551473, "Bo", "25", "VN", 15408),
      row(3160911, "Bø", "17", "NO", 2522, "Bo"),
    ];
    expect(offered("Bo", bos)).toEqual([2410048, 8551473, 3160911]);
    expect(offered("Bo, Norway", bos)[0]).toBe(3160911);
    expect(offered("Ho Vietnam", [], hos)).toEqual([8340703]);
  });

  it("finds Zürich as GeoNames spells it, and a plainly spelled name too", () => {
    const zurich = row(2657896, "Zürich", "ZH", "CH", 415367, "Zuerich");
    const lakeZurich = row(4899170, "Lake Zurich", "IL", "US", 19993);
    const nurtingen = row(2861632, "Nürtingen", "01", "DE", 40210, "Nurtingen");
    expect(offered("Zürich", [zurich], [lakeZurich])).toEqual([2657896]);
    expect(offered("Nürtingen", [], [nurtingen])).toEqual([2861632]);
  });

  it("finds Kalavad from Kalavad taluka", () => {
    expect(offered("Kalavad taluka", [], [KALAVAD])).toEqual([1268450]);
    expect(offered("Kalavad taluka, Jamnagar, Gujarat, India", [], [KALAVAD])).toEqual([
      1268450,
    ]);
  });

  it("keeps a name that really has the word, when the search as typed finds it", () => {
    expect(offered("State College", [STATE_COLLEGE], [COLLEGE_STATION, STATE_COLLEGE])).toEqual([
      5213681,
    ]);
  });

  it("keeps to the region named at the end with no comma", () => {
    expect(offered("Vancouver BC", [], VANCOUVER)).toEqual([
      6173331, 6090785, 12022702, 8533869,
    ]);
    expect(offered("Vancouver Washington", [], VANCOUVER)).toEqual([5814616]);
    expect(offered("London Ontario", [], LONDON)).toEqual([6058560]);
    expect(offered("Kalavad Gujarat", [], [KALAVAD])).toEqual([1268450]);
    // Nothing there by that name: nothing, as before, not places elsewhere.
    expect(offered("Kalavad Ontario", [], [KALAVAD])).toEqual([]);
    // The whole region, not one whose name starts the same.
    const richmonds = [
      row(4781708, "Richmond", "VA", "US", 226610),
      row(6122085, "Richmond", "02", "CA", 209937),
      row(4263681, "Richmond", "IN", "US", 35854),
    ];
    expect(offered("Richmond India", [], richmonds)).toEqual([]);
    expect(offered("Richmond Indiana", [], richmonds)).toEqual([4263681]);
  });

  it("offers nothing when neither search finds anything", () => {
    expect(offered("Zzvillagesixtyfour taluka", [], [])).toEqual([]);
    expect(offered("Zzvillagesixtyfour", [])).toEqual([]);
  });
});
