/**
 * A birthplace, read as a leaf.
 *
 * When a person's own tree is pulled out of the canvas their card takes the
 * silhouette of a leaf from a tree that grows where they were born — a sugar
 * maple for Canada, a baobab for Tanzania, an English oak for Yorkshire. It is
 * the one place in the app where the botany is literal, and it turns a row of
 * identical cards into something you can read at a glance: a family that moved
 * across the world has a line of leaves that changes shape as it descends.
 *
 * Deliberately coarse. This is a piece of decoration keyed to a free-text
 * field, not a botanical claim: one representative species per place, matched
 * on whole words so `Romania` never lands on `Oman`, and a plain unnamed leaf
 * whenever the birthplace is empty or unrecognised.
 */

/**
 * The silhouettes the canvas can draw. All of them keep a broad band through
 * the middle, because a name and a lifespan have to sit inside one: an acacia
 * frond or a ginkgo fan is the better botany and the worse card, so places
 * whose tree has one are matched to the nearest shape that reads. `palmate` is
 * the one compound shape — a hand of leaflets, for the baobab and the ceiba,
 * which would otherwise be drawn as maples and read as maples.
 */
export type LeafShape =
  "ovate" | "elliptic" | "cordate" | "maple" | "palmate" | "oak" | "round";

export type NativeLeaf = {
  shape: LeafShape;
  /** The tree the leaf came from, or null when the birthplace told us nothing. */
  species: string | null;
  /** The place that was matched, as it is named in the table. */
  region: string | null;
};

/** What a card falls back to: a leaf, from no tree in particular. */
const PLAIN_LEAF: NativeLeaf = { shape: "ovate", species: null, region: null };

type LeafEntry = {
  /**
   * Whole-word keys, matched against the birthplace. Historical names are in
   * here too — a tree entry that says Tanganyika, Ceylon or Persia is the norm
   * in the generations this app is mostly about.
   */
  keys: string[];
  species: string;
  region: string;
  shape: LeafShape;
};

// Longer, more specific keys first: "south africa" has to be tried before
// "africa", and "new zealand" before "zealand".
const LEAVES: LeafEntry[] = [
  // Africa
  {
    keys: ["tanzania", "tanganyika", "dar es salaam", "moshi", "arusha"],
    species: "Baobab",
    region: "Tanzania",
    shape: "palmate",
  },
  {
    keys: ["zanzibar", "pemba"],
    species: "Clove tree",
    region: "Zanzibar",
    shape: "elliptic",
  },
  {
    keys: ["uganda", "kampala", "entebbe", "jinja"],
    species: "Mvule",
    region: "Uganda",
    shape: "elliptic",
  },
  {
    keys: ["kenya", "nairobi", "mombasa"],
    species: "Mugumo fig",
    region: "Kenya",
    shape: "cordate",
  },
  {
    keys: ["rwanda", "burundi"],
    species: "Umuvumu fig",
    region: "Rwanda",
    shape: "cordate",
  },
  {
    keys: ["ethiopia", "eritrea", "addis ababa"],
    species: "African juniper",
    region: "Ethiopia",
    shape: "elliptic",
  },
  {
    keys: ["south africa", "johannesburg", "cape town", "durban", "pretoria"],
    species: "Real yellowwood",
    region: "South Africa",
    shape: "elliptic",
  },
  {
    keys: ["zimbabwe", "rhodesia", "harare", "zambia", "malawi"],
    species: "Msasa",
    region: "Zimbabwe",
    shape: "elliptic",
  },
  {
    keys: ["mozambique", "angola"],
    species: "Mopane",
    region: "Mozambique",
    shape: "round",
  },
  {
    keys: ["madagascar"],
    species: "Traveller's tree",
    region: "Madagascar",
    shape: "elliptic",
  },
  {
    keys: [
      "ivoire",
      "ivory",
      "abidjan",
      "senegal",
      "dakar",
      "mali",
      "guinea",
      "sierra leone",
      "liberia",
      "togo",
      "benin",
      "burkina",
    ],
    species: "Shea tree",
    region: "West Africa",
    shape: "elliptic",
  },
  {
    keys: ["somalia", "somaliland", "djibouti", "mogadishu"],
    species: "Frankincense tree",
    region: "the Horn of Africa",
    shape: "elliptic",
  },
  {
    keys: ["sudan", "khartoum", "chad", "niger"],
    species: "Gum arabic acacia",
    region: "Sudan",
    shape: "elliptic",
  },
  {
    keys: ["botswana", "namibia", "gaborone", "windhoek"],
    species: "Camelthorn",
    region: "the Kalahari",
    shape: "elliptic",
  },
  {
    keys: ["mauritius", "seychelles", "comoros", "reunion"],
    species: "Tambalacoque",
    region: "the Indian Ocean islands",
    shape: "elliptic",
  },
  {
    keys: [
      "saudi",
      "arabia",
      "yemen",
      "oman",
      "emirates",
      "dubai",
      "abu dhabi",
      "qatar",
      "kuwait",
      "bahrain",
      "muscat",
      "aden",
    ],
    species: "Date palm",
    region: "Arabia",
    shape: "elliptic",
  },
  {
    keys: ["switzerland", "zurich", "geneva", "liechtenstein"],
    species: "Norway spruce",
    region: "Switzerland",
    shape: "elliptic",
  },
  {
    keys: ["estonia", "latvia", "lithuania", "baltic"],
    species: "Scots pine",
    region: "the Baltics",
    shape: "elliptic",
  },
  {
    keys: ["georgia", "armenia", "azerbaijan", "tbilisi", "yerevan", "baku"],
    species: "Caucasian walnut",
    region: "the Caucasus",
    shape: "elliptic",
  },
  {
    keys: [
      "kazakhstan",
      "uzbekistan",
      "tajikistan",
      "kyrgyzstan",
      "turkmenistan",
      "samarkand",
      "tashkent",
    ],
    species: "Wild apple",
    region: "Central Asia",
    shape: "ovate",
  },
  {
    keys: ["papua", "new guinea", "solomon", "vanuatu"],
    species: "Klinki pine",
    region: "New Guinea",
    shape: "elliptic",
  },
  {
    keys: ["nigeria", "ghana", "lagos", "accra"],
    species: "Iroko",
    region: "West Africa",
    shape: "elliptic",
  },
  {
    keys: ["congo", "cameroon", "gabon"],
    species: "African mahogany",
    region: "Central Africa",
    shape: "elliptic",
  },
  {
    keys: ["egypt", "cairo", "alexandria"],
    species: "Sycamore fig",
    region: "Egypt",
    shape: "round",
  },
  {
    keys: ["morocco", "algeria", "tunisia", "libya"],
    species: "Argan",
    region: "North Africa",
    shape: "elliptic",
  },
  // South and West Asia
  {
    keys: [
      "india",
      "bombay",
      "mumbai",
      "gujarat",
      "kutch",
      "delhi",
      "kolkata",
      "calcutta",
      "chennai",
      "madras",
      "jamnagar",
      "porbandar",
    ],
    species: "Banyan",
    region: "India",
    shape: "ovate",
  },
  {
    keys: ["pakistan", "karachi", "lahore", "sindh", "punjab"],
    species: "Neem",
    region: "Pakistan",
    shape: "elliptic",
  },
  {
    keys: ["bangladesh", "dhaka", "bengal"],
    species: "Jackfruit",
    region: "Bangladesh",
    shape: "elliptic",
  },
  {
    keys: ["sri lanka", "ceylon", "colombo"],
    species: "Ironwood",
    region: "Sri Lanka",
    shape: "elliptic",
  },
  {
    keys: ["nepal", "kathmandu", "bhutan"],
    species: "Rhododendron",
    region: "Nepal",
    shape: "elliptic",
  },
  {
    keys: ["iran", "persia", "tehran"],
    species: "Oriental plane",
    region: "Iran",
    shape: "maple",
  },
  {
    keys: ["iraq", "mesopotamia", "baghdad"],
    species: "Date palm",
    region: "Iraq",
    shape: "elliptic",
  },
  {
    keys: ["lebanon", "syria", "beirut", "damascus"],
    species: "Cedar of Lebanon",
    region: "Lebanon",
    shape: "elliptic",
  },
  {
    keys: ["israel", "palestine", "jerusalem", "jaffa"],
    species: "Olive",
    region: "the Levant",
    shape: "elliptic",
  },
  {
    keys: ["turkey", "ottoman", "istanbul", "constantinople"],
    species: "Oriental plane",
    region: "Turkey",
    shape: "maple",
  },
  {
    keys: ["afghanistan", "kabul"],
    species: "Chinar",
    region: "Afghanistan",
    shape: "maple",
  },
  // East and Southeast Asia
  {
    keys: ["japan", "tokyo", "osaka", "kyoto"],
    species: "Japanese maple",
    region: "Japan",
    shape: "maple",
  },
  {
    keys: ["china", "hong kong", "shanghai", "beijing", "canton", "guangzhou"],
    species: "White mulberry",
    region: "China",
    shape: "cordate",
  },
  {
    keys: ["korea", "seoul"],
    species: "Zelkova",
    region: "Korea",
    shape: "elliptic",
  },
  {
    keys: [
      "vietnam",
      "thailand",
      "siam",
      "cambodia",
      "laos",
      "burma",
      "myanmar",
    ],
    species: "Teak",
    region: "Southeast Asia",
    shape: "elliptic",
  },
  {
    keys: ["malaysia", "singapore", "indonesia", "java", "borneo", "sumatra"],
    species: "Rain tree",
    region: "the Malay world",
    shape: "round",
  },
  {
    keys: ["philippines", "manila"],
    species: "Narra",
    region: "the Philippines",
    shape: "ovate",
  },
  // Europe
  {
    keys: [
      "united kingdom",
      "great britain",
      "england",
      "britain",
      "london",
      "yorkshire",
      "scotland",
      "wales",
      "leicester",
      "manchester",
      "birmingham",
    ],
    species: "English oak",
    region: "Britain",
    shape: "oak",
  },
  {
    keys: ["ireland", "dublin"],
    species: "Sessile oak",
    region: "Ireland",
    shape: "oak",
  },
  {
    keys: ["france", "paris"],
    species: "Sweet chestnut",
    region: "France",
    shape: "elliptic",
  },
  {
    keys: ["germany", "austria", "berlin", "vienna"],
    species: "Small-leaved lime",
    region: "Germany",
    shape: "cordate",
  },
  {
    keys: ["netherlands", "holland", "belgium", "amsterdam", "brussels"],
    species: "Common beech",
    region: "the Low Countries",
    shape: "ovate",
  },
  {
    keys: ["spain", "portugal", "madrid", "lisbon"],
    species: "Holm oak",
    region: "Iberia",
    shape: "oak",
  },
  {
    keys: ["italy", "rome", "sicily"],
    species: "Olive",
    region: "Italy",
    shape: "elliptic",
  },
  {
    keys: ["greece", "cyprus", "athens"],
    species: "Olive",
    region: "Greece",
    shape: "elliptic",
  },
  {
    keys: ["sweden", "norway", "finland", "denmark", "iceland"],
    species: "Silver birch",
    region: "Scandinavia",
    shape: "ovate",
  },
  {
    keys: [
      "poland",
      "czech",
      "slovakia",
      "hungary",
      "romania",
      "bulgaria",
      "serbia",
      "croatia",
    ],
    species: "Small-leaved lime",
    region: "Central Europe",
    shape: "cordate",
  },
  {
    keys: ["russia", "ukraine", "belarus", "moscow", "kyiv", "kiev", "siberia"],
    species: "Siberian birch",
    region: "Russia",
    shape: "ovate",
  },
  // The Americas and Oceania
  {
    keys: [
      "canada",
      "toronto",
      "scarborough",
      "ontario",
      "quebec",
      "montreal",
      "vancouver",
      "calgary",
      "alberta",
    ],
    species: "Sugar maple",
    region: "Canada",
    shape: "maple",
  },
  {
    keys: [
      "united states",
      "usa",
      "america",
      "new york",
      "california",
      "texas",
      "chicago",
      "boston",
      "florida",
    ],
    species: "Northern red oak",
    region: "the United States",
    shape: "oak",
  },
  {
    keys: [
      "mexico",
      "guatemala",
      "costa rica",
      "panama",
      "cuba",
      "jamaica",
      "haiti",
      "trinidad",
      "barbados",
    ],
    species: "Ceiba",
    region: "the Caribbean and Central America",
    shape: "palmate",
  },
  {
    keys: ["brazil", "rio de janeiro", "sao paulo"],
    species: "Brazilwood",
    region: "Brazil",
    shape: "elliptic",
  },
  {
    keys: [
      "argentina",
      "chile",
      "uruguay",
      "peru",
      "bolivia",
      "colombia",
      "venezuela",
      "ecuador",
    ],
    species: "Ceibo",
    region: "South America",
    shape: "ovate",
  },
  {
    keys: ["australia", "sydney", "melbourne", "perth", "brisbane"],
    species: "Eucalyptus",
    region: "Australia",
    shape: "elliptic",
  },
  {
    keys: ["new zealand", "auckland", "wellington"],
    species: "Pohutukawa",
    region: "New Zealand",
    shape: "elliptic",
  },
  {
    keys: ["fiji", "samoa", "tonga"],
    species: "Ivi",
    region: "the Pacific Islands",
    shape: "elliptic",
  },
];

/** Fold accents and punctuation away, leaving lowercase words. */
const words = (text: string): string[] =>
  text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

/** Whether `key` (one word or several) appears as whole words in `tokens`. */
function contains(tokens: string[], key: string): boolean {
  const parts = key.split(" ");
  for (let i = 0; i + parts.length <= tokens.length; i++) {
    if (parts.every((part, j) => tokens[i + j] === part)) return true;
  }
  return false;
}

/**
 * The leaf for a birthplace. City and country are searched together, so
 * "Moshi, Tanganyika" and a bare "Zanzibar" both land somewhere.
 */
export function nativeLeaf(person: {
  city_of_birth?: string | null;
  country_of_birth?: string | null;
}): NativeLeaf {
  const text = [person.city_of_birth, person.country_of_birth]
    .filter(Boolean)
    .join(" ");
  if (!text.trim()) return PLAIN_LEAF;
  const tokens = words(text);
  for (const entry of LEAVES) {
    if (entry.keys.some((key) => contains(tokens, key)))
      return {
        shape: entry.shape,
        species: entry.species,
        region: entry.region,
      };
  }
  return PLAIN_LEAF;
}

/** How the leaf names itself on a card: "Sugar maple · Canada". */
export function leafLabel(leaf: NativeLeaf): string | null {
  return leaf.species && leaf.region
    ? `${leaf.species} · ${leaf.region}`
    : null;
}
