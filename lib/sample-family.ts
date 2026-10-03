/**
 * The sample family (Step 118.1): an invented family, four generations,
 * Gujarat → Zanzibar → Toronto, shown signed out at /sample (Step 118.2).
 * Every name, date and story here is fiction; the places are real `places`
 * rows, so ancestral lands show under the Canadian births. Cards keep their
 * leaf (no faces); the album holds credited public-domain or CC0 photos of
 * places and things, each tagged to whoever it belongs with.
 *
 * `npm run sample:seed` (scripts/seed-sample-tree.ts) writes all of this
 * with the service role, after migration `20261003150000_sample_tree`. It is
 * idempotent: run it again after editing this file. The tree is held by a
 * system account (`SAMPLE_OWNER_ID`) that belongs to no tree and can't sign
 * in; the migration says why.
 */

/** The tree, and the account that holds it. Fixed, so the seed can run again. */
export const SAMPLE_TREE_ID = "ca221b32-e471-4beb-8374-2733f7357c44";
export const SAMPLE_OWNER_ID = "0b578d24-85f2-4417-a955-98d4d0935fab";
/** Never receives mail (`.invalid`), and the account is banned besides. */
export const SAMPLE_OWNER_EMAIL = "sample@ancestree.invalid";
/** Shown as "Added by" on its stories and photos. */
export const SAMPLE_OWNER_NAME = "Zahra Damani";
export const SAMPLE_TREE_NAME = "Damani Family";
export const SAMPLE_TREE_SLUG = "sample";

type Precision = "day" | "month" | "year";

export type SamplePerson = {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  maiden_name?: string;
  sex: "male" | "female";
  /** `YYYY-MM-DD`; a year or month date is the first of it. */
  date_of_birth: string;
  date_of_birth_precision?: Precision;
  date_of_birth_circa?: boolean;
  place_id_birth: number;
  city_of_birth: string;
  country_of_birth: string;
  date_of_death?: string;
  date_of_death_precision?: Precision;
  place_id_death?: number;
  /** "City, Country", as the add form writes it. */
  place_of_death?: string;
};

export type SampleRelationship =
  | { type: "parent"; from: string; to: string }
  | { type: "spouse"; from: string; to: string; marriage_date: string };

export type SampleStory = {
  id: string;
  /** Who it's about. */
  person_id: string;
  title: string;
  /** Markdown, as a written story is (Step 99). */
  body: string;
  told_on: string;
  told_on_precision: Precision;
  /** People it mentions (Step 116), never its own person. */
  mentions: string[];
  created_at: string;
};

export type SamplePhoto = {
  id: string;
  /** In scripts/sample-tree/photos/. */
  file: string;
  /** What it shows and its credit: author, year, licence, source. */
  description: string;
  taken_on?: string;
  taken_on_precision?: Precision;
  /** Whose sheets it shows on. */
  tags: string[];
  created_at: string;
};

/** Real `places` rows (GeoNames ids). */
export const SAMPLE_PLACES = {
  bhuj: 1275812,
  jamnagar: 1269317,
  zanzibar: 148730,
  mombasa: 186301,
  darEsSalaam: 160263,
  kampala: 232422,
  leicester: 2644668,
  toronto: 6167865,
  mississauga: 6075357,
  montreal: 6077243,
} as const;

const P = SAMPLE_PLACES;

const VELJI = "c9b7e2d2-04ee-464a-8707-5a0e4f499f14";
const KANBAI = "41f3a19a-4bfe-4048-8d90-1ca14c512fc6";
const RAMZAN = "621c59da-8c48-425a-8171-fa22310ad2ed";
const SAKINA = "3a923840-de0c-4173-8ced-44347b158215";
const FATMA = "18528160-48b6-432c-bc49-00b3a458db2c";
const HASSAN = "9b690eac-5020-41b6-9d83-cfbc703d8f9f";
const ABDUL = "fd18224d-299a-4c22-81f4-9c447b812e73";
const MUMTAZ = "07850981-9ec5-448a-b150-bf17cb576647";
const NIZAR = "e619ce4e-7035-4135-b694-216954ccf5f6";
const SHIRIN = "4cb6347e-7ec3-40ff-bcb8-df9ca6b77fb3";
const YASMIN = "c0fe9bcf-6a3e-4dce-820c-c45bb2dd09bb";
const KARIM = "5444a877-a029-43ed-97f4-2c3feb2fa9b1";
const REHMAT = "2b1deca8-c02f-45ef-bbef-5a82b7e6ea24";
const AMIN = "d9a2fa18-5602-4bb0-9df8-19b4d2a887a8";
const NOOR = "f27151e0-b870-4fa9-80b1-d8b2b4cf714c";
const ZAHRA = "64fe70b0-1558-43bd-912b-4d9c55fa1d33";
const LUCAS = "c179c56d-1454-4471-921e-bc5af0944691";
const IMRAN = "d28d5acd-4556-4e42-9d49-c4de281b397a";
const LEILA = "635b19c6-d9ba-4966-a282-399c28399c96";
const SAMEER = "d1933c4a-cde5-4014-a0d4-9c124fa233c1";

const ZNZ = { place_id_birth: P.zanzibar, city_of_birth: "Zanzibar", country_of_birth: "Tanzania" };
const DAR = { place_id_birth: P.darEsSalaam, city_of_birth: "Dar es Salaam", country_of_birth: "Tanzania" };
const TOR = { place_id_birth: P.toronto, city_of_birth: "Toronto", country_of_birth: "Canada" };
const MISS = { place_id_birth: P.mississauga, city_of_birth: "Mississauga", country_of_birth: "Canada" };

export const SAMPLE_PEOPLE: SamplePerson[] = [
  // Generation 1: Bhuj and Jamnagar, Gujarat → Zanzibar, 1919.
  {
    id: VELJI, first_name: "Velji", last_name: "Damani", sex: "male",
    date_of_birth: "1894-01-01", date_of_birth_precision: "year", date_of_birth_circa: true,
    place_id_birth: P.bhuj, city_of_birth: "Bhuj", country_of_birth: "India",
    date_of_death: "1961-01-01", date_of_death_precision: "year",
    place_id_death: P.zanzibar, place_of_death: "Zanzibar, Tanzania",
  },
  {
    id: KANBAI, first_name: "Kanbai", last_name: "Damani", maiden_name: "Lalji", sex: "female",
    date_of_birth: "1899-01-01", date_of_birth_precision: "year",
    place_id_birth: P.jamnagar, city_of_birth: "Jamnagar", country_of_birth: "India",
    date_of_death: "1979-03-14", place_id_death: P.toronto, place_of_death: "Toronto, Canada",
  },
  // Generation 2: born in Zanzibar; Toronto, Dar es Salaam and Leicester.
  {
    id: RAMZAN, first_name: "Ramzan", middle_name: "Velji", last_name: "Damani", sex: "male",
    date_of_birth: "1922-05-09", ...ZNZ,
    date_of_death: "1998-12-01", place_id_death: P.toronto, place_of_death: "Toronto, Canada",
  },
  {
    id: SAKINA, first_name: "Sakina", last_name: "Damani", maiden_name: "Pirani", sex: "female",
    date_of_birth: "1927-10-03",
    place_id_birth: P.mombasa, city_of_birth: "Mombasa", country_of_birth: "Kenya",
    date_of_death: "2011-06-19", place_id_death: P.toronto, place_of_death: "Toronto, Canada",
  },
  {
    id: FATMA, first_name: "Fatma", last_name: "Kanji", maiden_name: "Damani", sex: "female",
    date_of_birth: "1925-02-17", ...ZNZ,
    date_of_death: "2004-07-22", place_id_death: P.darEsSalaam, place_of_death: "Dar es Salaam, Tanzania",
  },
  {
    id: HASSAN, first_name: "Hassan", last_name: "Kanji", sex: "male",
    date_of_birth: "1920-04-12", ...DAR,
    date_of_death: "1990-09-05", place_id_death: P.darEsSalaam, place_of_death: "Dar es Salaam, Tanzania",
  },
  {
    id: ABDUL, first_name: "Abdul", last_name: "Damani", sex: "male",
    date_of_birth: "1931-08-30", ...ZNZ,
    date_of_death: "2015-01-11", place_id_death: P.leicester, place_of_death: "Leicester, United Kingdom",
  },
  {
    id: MUMTAZ, first_name: "Mumtaz", last_name: "Damani", maiden_name: "Rawji", sex: "female",
    date_of_birth: "1935-01-21", ...ZNZ,
    date_of_death: "2018-11-30", place_id_death: P.leicester, place_of_death: "Leicester, United Kingdom",
  },
  // Generation 3: Zanzibar, Dar es Salaam and Kampala → Toronto, 1970s.
  { id: NIZAR, first_name: "Nizar", last_name: "Damani", sex: "male", date_of_birth: "1950-02-14", ...ZNZ },
  {
    id: SHIRIN, first_name: "Shirin", last_name: "Damani", maiden_name: "Jaffer", sex: "female",
    date_of_birth: "1954-11-11",
    place_id_birth: P.kampala, city_of_birth: "Kampala", country_of_birth: "Uganda",
  },
  { id: YASMIN, first_name: "Yasmin", last_name: "Hirji", maiden_name: "Damani", sex: "female", date_of_birth: "1953-06-05", ...ZNZ },
  {
    id: KARIM, first_name: "Karim", last_name: "Hirji", sex: "male", date_of_birth: "1949-03-02", ...DAR,
    date_of_death: "2019-04-27", place_id_death: P.mississauga, place_of_death: "Mississauga, Canada",
  },
  { id: REHMAT, first_name: "Rehmat", last_name: "Damani", sex: "female", date_of_birth: "1957-09-21", ...ZNZ },
  { id: AMIN, first_name: "Amin", last_name: "Kanji", sex: "male", date_of_birth: "1952-12-19", ...DAR },
  { id: NOOR, first_name: "Noor", last_name: "Kanji", sex: "female", date_of_birth: "1956-04-08", ...DAR },
  // Generation 4: born in Canada.
  { id: ZAHRA, first_name: "Zahra", last_name: "Damani", sex: "female", date_of_birth: "1979-01-30", ...TOR },
  {
    id: LUCAS, first_name: "Lucas", last_name: "Moreau", sex: "male", date_of_birth: "1977-10-15",
    place_id_birth: P.montreal, city_of_birth: "Montréal", country_of_birth: "Canada",
  },
  { id: IMRAN, first_name: "Imran", last_name: "Damani", sex: "male", date_of_birth: "1983-07-04", ...TOR },
  { id: LEILA, first_name: "Leila", last_name: "Hirji", sex: "female", date_of_birth: "1981-12-02", ...MISS },
  { id: SAMEER, first_name: "Sameer", last_name: "Hirji", sex: "male", date_of_birth: "1985-05-16", ...MISS },
];

const parents = (a: string, b: string, ...children: string[]): SampleRelationship[] =>
  children.flatMap((c) => [
    { type: "parent" as const, from: a, to: c },
    { type: "parent" as const, from: b, to: c },
  ]);

export const SAMPLE_RELATIONSHIPS: SampleRelationship[] = [
  { type: "spouse", from: VELJI, to: KANBAI, marriage_date: "1918-11-02" },
  ...parents(VELJI, KANBAI, RAMZAN, FATMA, ABDUL),
  { type: "spouse", from: RAMZAN, to: SAKINA, marriage_date: "1948-12-26" },
  { type: "spouse", from: HASSAN, to: FATMA, marriage_date: "1946-03-10" },
  { type: "spouse", from: ABDUL, to: MUMTAZ, marriage_date: "1957-07-14" },
  ...parents(RAMZAN, SAKINA, NIZAR, YASMIN, REHMAT),
  ...parents(HASSAN, FATMA, AMIN, NOOR),
  { type: "spouse", from: NIZAR, to: SHIRIN, marriage_date: "1976-08-07" },
  { type: "spouse", from: KARIM, to: YASMIN, marriage_date: "1975-05-24" },
  ...parents(NIZAR, SHIRIN, ZAHRA, IMRAN),
  ...parents(KARIM, YASMIN, LEILA, SAMEER),
  { type: "spouse", from: LUCAS, to: ZAHRA, marriage_date: "2008-06-21" },
];

export const SAMPLE_STORIES: SampleStory[] = [
  {
    id: "7d17ca66-d5fe-4b73-b96b-b15892df335a",
    person_id: VELJI,
    title: "The dhow from Mandvi",
    told_on: "2009-08-01",
    told_on_precision: "month",
    mentions: [KANBAI, RAMZAN],
    created_at: "2026-08-02T18:20:00Z",
    body: `Velji was twenty-five when he left Bhuj. He walked to Mandvi with a tin trunk, a letter for a cousin he had never met, and enough money for one passage. The dhows went south when the monsoon wind turned, and he waited eleven days on the beach for it.

The crossing took most of a month. He told his children he slept on sacks of dates and learned to count in Swahili from the crew before he ever saw Zanzibar.

The cousin gave him a corner of a cloth shop in Stone Town. Within two years Velji had a shop of his own, and he sent for **Kanbai**, who had waited for him in Jamnagar since their wedding.

> "He never went back," Ramzan used to say. "But he kept the trunk under the bed until the day he died."`,
  },
  {
    id: "441b9d66-5927-4581-82ec-c10fc8c7e09d",
    person_id: KANBAI,
    title: "Kanbai's tin of cardamom",
    told_on: "2014-12-01",
    told_on_precision: "month",
    mentions: [NIZAR, ZAHRA],
    created_at: "2026-08-09T14:05:00Z",
    body: `Kanbai came to Toronto in November 1975, at seventy-six, with one suitcase and a round tin of green cardamom from the market in Jamnagar. She had carried the same kind of tin to Zanzibar in 1921 and refilled it for fifty years.

The first snow fell the week she arrived. Nizar drove her to the lake to see it, and she said it looked like the salt flats in Kutch.

She lived with Nizar and Shirin on the top floor of their house and made chai for anyone who came up the stairs. She was there when Zahra was born in January 1979, and held her great-granddaughter every afternoon until she died that March.

The tin is still in Zahra's kitchen. It still smells of cardamom.`,
  },
  {
    id: "bb71f029-2521-4022-9c40-5c9f40490804",
    person_id: RAMZAN,
    title: "The shop with the carved door",
    told_on: "2016-01-01",
    told_on_precision: "year",
    mentions: [VELJI, SAKINA, NIZAR, YASMIN, REHMAT],
    created_at: "2026-08-16T20:40:00Z",
    body: `Ramzan took over his father's shop in 1950, the year Nizar was born. It sold cloth, buttons and thread from a long room behind a carved wooden door, and Velji still sat on the bench outside every morning to talk with whoever passed.

In 1964, after the revolution, the family left Zanzibar for Dar es Salaam with one suitcase each. Ramzan locked the carved door himself and gave the key to a neighbour. Sakina sewed their savings into the hem of Rehmat's school dress.

Ten years later they moved again, to Toronto. Ramzan worked nights in a warehouse on the lakeshore until he and Sakina could open a dry cleaner in Scarborough. Yasmin did the books. Nizar delivered the shirts.

When Nizar finally went back to Stone Town in 2008, the shop was a café. The door was still there.`,
  },
  {
    id: "90167372-3454-425f-ae7c-367a51388155",
    person_id: SHIRIN,
    title: "Ninety days",
    told_on: "2022-08-01",
    told_on_precision: "month",
    mentions: [NIZAR],
    created_at: "2026-08-23T16:15:00Z",
    body: `In August 1972 Shirin was seventeen and in her last year of school in Kampala when the radio said every Asian family had ninety days to leave Uganda.

Her father queued for a week at the Canadian office. They left in October with two suitcases, a sewing machine they had to abandon at the airport, and a box of photographs her mother refused to put down. They flew to Montreal and spent their first Canadian winter at a military base, where volunteers handed out coats that were too big for everyone.

In the spring they moved to Toronto. Shirin met Nizar at a friend's wedding in 1975; he was the only one who asked her to dance twice.

She still keeps her boarding pass, folded inside her passport.`,
  },
];

export const SAMPLE_PHOTOS: SamplePhoto[] = [
  {
    id: "19ad5fda-e3af-44a1-97eb-d5f64aecf855",
    file: "bhuj.jpg",
    description:
      "Bhuj, in Kutch, where Velji was born: a mosque in the old town, photographed in 1875.\n\nPhoto: James Burgess, 1875. Public domain, via Wikimedia Commons.",
    taken_on: "1875-01-01",
    taken_on_precision: "year",
    tags: [VELJI],
    created_at: "2026-08-02T18:30:00Z",
  },
  {
    id: "bb204ee6-4565-48da-a924-93a7bbd28b8a",
    file: "dhow.jpg",
    description:
      "A baghlah under sail, the kind of dhow Velji crossed to Zanzibar on in 1919.\n\nPhoto: Aliparsa, 1974. CC0, via Wikimedia Commons.",
    taken_on: "1974-04-25",
    taken_on_precision: "day",
    tags: [VELJI],
    created_at: "2026-08-02T18:35:00Z",
  },
  {
    id: "a335f463-f82c-419d-992a-cbb113861e7f",
    file: "zanzibar-door-1920.jpg",
    description:
      "A carved door in Zanzibar, like the one on the Damani shop in Stone Town.\n\nPhoto: Francis Barrow Pearce, 1920. Public domain, via Wikimedia Commons.",
    taken_on: "1920-01-01",
    taken_on_precision: "year",
    tags: [VELJI, RAMZAN],
    created_at: "2026-08-16T20:50:00Z",
  },
  {
    id: "4f1ae669-8526-48d6-8a3f-4b22ea2b6872",
    file: "stone-town-door.jpg",
    description:
      "Still standing: a carved door in Stone Town, found on Nizar's trip back in 2008.\n\nPhoto: Nannarella, 2008. Public domain, via Wikimedia Commons.",
    taken_on: "2008-01-01",
    taken_on_precision: "year",
    tags: [NIZAR, RAMZAN],
    created_at: "2026-08-16T20:55:00Z",
  },
  {
    id: "79545789-decd-4b9b-8693-7cad4c2009fc",
    file: "ormara.jpg",
    description:
      "The Ormara, a British India steamer. Abdul left Mombasa for England on a ship like this in 1956.\n\nPhoto: State Library of Queensland. Public domain, via Wikimedia Commons.",
    tags: [ABDUL],
    created_at: "2026-08-30T11:10:00Z",
  },
  {
    id: "fbe5b1f4-232a-46d8-ade2-b453e96f7262",
    file: "toronto-1930.jpg",
    description:
      "Union Station and the harbour, Toronto, 1930: the lakeshore where Ramzan worked nights after the family arrived in 1974.\n\nPhoto: Archives of Ontario, 1930. Public domain, via Wikimedia Commons.",
    taken_on: "1930-01-01",
    taken_on_precision: "year",
    tags: [RAMZAN, SAKINA],
    created_at: "2026-08-30T11:15:00Z",
  },
];
