import { ALPHA2, countryName } from "@/lib/country-names";
import { MIN_LETTERS } from "@/lib/place-choice";
import { ADMIN1_NAMES, COUNTRY_OTHER_NAMES } from "@/lib/place-regions";

/**
 * What the place picker's search looks for, and in what order the places come
 * back (Step 66). Pure; `searchPlaces` in lib/places.ts runs it against
 * `places` (`search_name ILIKE '%<name>%'`, trigram-indexed).
 *
 * Before this the whole typed text had to sit inside one name, so the shape
 * the picker's own labels read in ("Vancouver, BC, Canada"), a trailing
 * comma, or a word like "taluka" found nothing. Now only the part before the
 * first comma is searched; what follows it names a region, and places there
 * come first. When that finds nothing, the fallback drops words that say what
 * kind of place it is ("Kalavad taluka") and a region named at the end with no
 * comma ("Vancouver BC"). A name shorter than MIN_LETTERS is only matched
 * whole (`ILIKE 'bo'`), which the index serves; anywhere in a name it would
 * scan every place (Step 66.5).
 */

/** Shortest name the search runs for, matched whole below MIN_LETTERS. */
const MIN_NAME = 2;
/** Shortest region hint that counts. */
const MIN_HINT = 2;

/**
 * Words that say what kind of place something is rather than naming it.
 * GeoNames' names seldom carry them, so the fallback leaves them out.
 */
const PLACE_KIND_WORDS: ReadonlySet<string> = new Set([
  "taluka", "taluk", "tal", "tehsil", "tahsil", "mandal",
  "district", "dist", "zila", "zilla",
  "county", "parish", "province", "state", "region", "division",
  "municipality", "prefecture", "governorate", "oblast",
  "city", "town", "village",
]);

/** Letters Unicode doesn't split into a base letter and an accent. */
const PLAIN_LETTERS: Readonly<Record<string, string>> = {
  ß: "ss", ø: "o", ł: "l", đ: "d", ð: "d", þ: "th", æ: "ae", œ: "oe", ı: "i",
};

const SPELLED_OUT: Readonly<Record<string, string>> = { ä: "ae", ö: "oe", ü: "ue" };

/**
 * Typed text in the shape of `search_name` (`lower(ascii_name)`): lowercase,
 * accents off ("Kālāvad", as the label shows it, is "kalavad"), a phone's
 * curly apostrophes and long dashes made plain, and the characters ILIKE and
 * PostgREST read as wildcards removed.
 */
export function foldPlaceText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ßøłđðþæœı]/g, (ch) => PLAIN_LETTERS[ch] ?? ch)
    .replace(/[\u2018\u2019\u201b\u2032`\u00b4]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[%_*\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The same, with ä, ö and ü spelled ae, oe and ue, as GeoNames' ascii names
 * mostly do ("Zürich" is "Zuerich"); the fallback tries the plain spelling.
 */
function foldSpelledOut(text: string): string {
  return foldPlaceText(
    text
      .normalize("NFC")
      .toLowerCase()
      .replace(/[äöü]/g, (ch) => SPELLED_OUT[ch] ?? ch),
  );
}

/** A region name for comparing: no dots, apostrophes or brackets, "&" as "and". */
function regionKey(text: string): string {
  return foldPlaceText(text)
    .replace(/[.']/g, "")
    .replace(/&/g, " and ")
    .replace(/[-()/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlaceKind(word: string): boolean {
  return PLACE_KIND_WORDS.has(word.replace(/[.:]+$/, ""));
}

/** A hint without its place-kind words ("washington state" → "washington"). */
function withoutKinds(hint: string): string {
  return hint.split(" ").filter((w) => !isPlaceKind(w)).join(" ");
}

/**
 * Region names that can end a search with no comma before them: countries'
 * names and the states and provinces in ADMIN1_NAMES, but not bare ISO codes,
 * which too many short words are.
 */
const REGION_PHRASES: ReadonlySet<string> = new Set([
  ...ALPHA2.map((cc) => regionKey(countryName(cc))),
  ...Object.values(COUNTRY_OTHER_NAMES).flat(),
  ...Object.values(ADMIN1_NAMES).flat(),
]);
const MAX_REGION_WORDS = Math.max(
  ...[...REGION_PHRASES].map((p) => p.split(" ").length),
);

const regionWordsCache = new Map<string, readonly string[]>();

/** Every name a place's country and state answer to. */
function regionWordsFor(
  countryCode: string | null,
  admin1: string | null,
): readonly string[] {
  const cc = countryCode?.trim().toUpperCase() ?? "";
  const key = `${cc}.${admin1 ?? ""}`;
  const cached = regionWordsCache.get(key);
  if (cached) return cached;

  const words: string[] = [];
  if (cc) {
    words.push(cc.toLowerCase(), regionKey(countryName(cc)));
    words.push(...(COUNTRY_OTHER_NAMES[cc] ?? []));
  }
  if (admin1) {
    // A letter code ("WA", "ENG") or the state a Root typed for a place they
    // added ("Gujarat"); GeoNames' number codes mean nothing on their own.
    if (/^[a-z]/i.test(admin1)) words.push(regionKey(admin1));
    words.push(...(ADMIN1_NAMES[`${cc}.${admin1}`] ?? []));
  }
  regionWordsCache.set(key, words);
  return words;
}

/**
 * How well a place's region answers one hint: 2 when named exactly, 1 when the
 * hint is the start of a name ("brit" for British Columbia) or a name with
 * more after it ("kenya colony").
 */
function regionMatch(hint: string, words: readonly string[]): number {
  let best = 0;
  for (const word of words) {
    if (word === hint) return 2;
    if (word.startsWith(hint) || hint.startsWith(`${word} `)) best = 1;
  }
  return best;
}

function hintMatch(hint: string, words: readonly string[]): number {
  const bare = withoutKinds(hint);
  return Math.max(
    regionMatch(hint, words),
    bare && bare !== hint ? regionMatch(bare, words) : 0,
  );
}

export type PlaceSearch = {
  /** What `search_name` must contain. */
  name: string;
  /** Regions named alongside the name ("bc", "canada"); places there come first. */
  hints: string[];
  /** Regions the fallback took off the end of the name; places must be in one, by that name. */
  within: string[];
  /**
   * Everything typed, its parts joined as GeoNames writes them, so a name
   * with a comma in it ("Misato, Saitama") typed whole still comes first.
   */
  whole: string;
  /** `search_name` must be the name itself, not contain it: too short to look inside. */
  exact: boolean;
};

export type PlaceQuery = PlaceSearch & {
  /**
   * The search again without place-kind words or a region named at the end
   * ("Kalavad taluka" → "kalavad"; "Vancouver BC" → "vancouver" in BC). It
   * counts only when the search as typed finds nothing, so a name that really
   * has such a word ("State College", "District Heights") is still found.
   */
  fallback: PlaceSearch | null;
};

const parts = (text: string) => text.split(",").map((part) => part.trim());
const isShort = (name: string) => name.length < MIN_LETTERS;

/** What a typed search looks for; null when there's too little to search. */
export function shapePlaceQuery(typed: string): PlaceQuery | null {
  const [name, ...after] = parts(foldSpelledOut(typed));
  if (name.length < MIN_NAME) return null;

  const rest = after.filter(Boolean);
  const hints = rest.map(regionKey).filter((hint) => hint.length >= MIN_HINT);
  const whole = [name, ...rest].join(", ");
  const plain = parts(foldPlaceText(typed))[0];
  return {
    name,
    hints,
    within: [],
    whole,
    exact: isShort(name),
    fallback: fallbackFor(name, hints, whole) ?? plainSpelling(plain, name, hints, whole),
  };
}

function fallbackFor(
  name: string,
  hints: string[],
  whole: string,
): PlaceSearch | null {
  const words = name.split(" ").filter((word) => !isPlaceKind(word));
  const within: string[] = [];
  // A region typed alone ("New Jersey") is left alone; after a name it's
  // where the place is ("Vancouver BC", "Toronto Ontario Canada").
  if (!REGION_PHRASES.has(regionKey(words.join(" ")))) {
    for (let k = trailingRegion(words); k > 0; k = trailingRegion(words)) {
      within.unshift(regionKey(words.splice(words.length - k).join(" ")));
    }
  }
  const rest = words.join(" ");
  if (rest === name || rest.length < MIN_NAME) return null;
  return { name: rest, hints: [...within, ...hints], within, whole, exact: isShort(rest) };
}

/** The name with ä, ö and ü as plain a, o and u, when it has any ("Nurtingen"). */
function plainSpelling(
  plain: string,
  name: string,
  hints: string[],
  whole: string,
): PlaceSearch | null {
  if (plain === name || plain.length < MIN_NAME) return null;
  return { name: plain, hints, within: [], whole, exact: isShort(plain) };
}

/** How many words at the end name a region, leaving at least one before them. */
function trailingRegion(words: string[]): number {
  for (let k = Math.min(MAX_REGION_WORDS, words.length - 1); k > 0; k--) {
    if (REGION_PHRASES.has(regionKey(words.slice(-k).join(" ")))) return k;
  }
  return 0;
}

export type PlaceRow = {
  name: string;
  ascii_name: string | null;
  search_name: string | null;
  admin1_code: string | null;
  country_code: string | null;
  population: number | null;
};

/**
 * Places in the order to offer them: the whole typed text as a name
 * ("Misato, Saitama"), then the regions hinted at, then how closely the name
 * matches (exact > prefix > word > anywhere), then population. Places outside
 * a region the fallback took off the end are left out.
 */
export function rankPlaces<T extends PlaceRow>(
  rows: readonly T[],
  search: PlaceSearch,
): T[] {
  const q = search.name;
  const scored = rows.flatMap((row) => {
    const words = regionWordsFor(row.country_code, row.admin1_code);
    // A whole region name was taken off, so only that region will do
    // ("Richmond India" isn't Richmond, Indiana).
    if (
      search.within.length > 0 &&
      !search.within.some((hint) => hintMatch(hint, words) === 2)
    ) {
      return [];
    }
    const hay = (row.search_name ?? row.ascii_name ?? row.name).toLowerCase();
    let name = 0;
    if (hay === q) name = 3;
    else if (hay.startsWith(q)) name = 2;
    else if (hay.includes(` ${q}`)) name = 1;
    return [
      {
        row,
        whole: hay === search.whole ? 1 : 0,
        region: search.hints.reduce((sum, hint) => sum + hintMatch(hint, words), 0),
        name,
        pop: row.population ?? 0,
      },
    ];
  });
  scored.sort(
    (a, b) =>
      b.whole - a.whole || b.region - a.region || b.name - a.name || b.pop - a.pop,
  );
  return scored.map(({ row }) => row);
}

/**
 * The places to offer: the search as typed, ranked, or — when it found
 * nothing — its fallback's.
 */
export function choosePlaces<T extends PlaceRow>(
  query: PlaceQuery,
  found: readonly T[],
  rescued: readonly T[] | null,
): T[] {
  if (found.length > 0 || !query.fallback || !rescued) {
    return rankPlaces(found, query);
  }
  return rankPlaces(rescued, query.fallback);
}
