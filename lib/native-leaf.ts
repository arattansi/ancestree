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
 * Coarse about places, not about leaves. This is a piece of decoration keyed
 * to a free-text field, not a botanical claim: one representative species per
 * place, matched on whole words so `Romania` never lands on `Oman`, and a
 * plain unnamed leaf whenever the birthplace is empty or unrecognised. But the
 * leaf drawn is that species' own (Step 96): a banyan's blunt fig leaf, a
 * date palm's frond, a mopane's pair of wings — see `lib/leaf-shapes.ts`.
 */

import type { LeafShape } from "@/lib/leaf-shapes";

export type { LeafShape };

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
    shape: "baobab",
  },
  {
    keys: ["zanzibar", "pemba"],
    species: "Clove tree",
    region: "Zanzibar",
    shape: "clove",
  },
  {
    keys: ["uganda", "kampala", "entebbe", "jinja"],
    species: "Mvule",
    region: "Uganda",
    shape: "iroko",
  },
  {
    keys: ["kenya", "nairobi", "mombasa"],
    species: "Mugumo fig",
    region: "Kenya",
    shape: "fig",
  },
  {
    keys: ["rwanda", "burundi"],
    species: "Umuvumu fig",
    region: "Rwanda",
    shape: "fig",
  },
  {
    keys: ["ethiopia", "eritrea", "addis ababa"],
    species: "African juniper",
    region: "Ethiopia",
    shape: "juniper",
  },
  {
    keys: ["south africa", "johannesburg", "cape town", "durban", "pretoria"],
    species: "Real yellowwood",
    region: "South Africa",
    shape: "yellowwood",
  },
  {
    keys: ["zimbabwe", "rhodesia", "harare", "zambia", "malawi"],
    species: "Msasa",
    region: "Zimbabwe",
    shape: "msasa",
  },
  {
    keys: ["mozambique", "angola"],
    species: "Mopane",
    region: "Mozambique",
    shape: "mopane",
  },
  {
    keys: ["madagascar"],
    species: "Traveller's tree",
    region: "Madagascar",
    shape: "travellers-tree",
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
    shape: "shea",
  },
  {
    keys: ["somalia", "somaliland", "djibouti", "mogadishu"],
    species: "Frankincense tree",
    region: "the Horn of Africa",
    shape: "frankincense",
  },
  {
    keys: ["sudan", "khartoum", "chad", "niger"],
    species: "Gum arabic acacia",
    region: "Sudan",
    shape: "acacia",
  },
  {
    keys: ["botswana", "namibia", "gaborone", "windhoek"],
    species: "Camelthorn",
    region: "the Kalahari",
    shape: "acacia",
  },
  {
    keys: ["mauritius", "seychelles", "comoros", "reunion"],
    species: "Tambalacoque",
    region: "the Indian Ocean islands",
    shape: "obovate",
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
    shape: "palm",
  },
  {
    keys: ["switzerland", "zurich", "geneva", "liechtenstein"],
    species: "Norway spruce",
    region: "Switzerland",
    shape: "spruce",
  },
  {
    keys: ["estonia", "latvia", "lithuania", "baltic"],
    species: "Scots pine",
    region: "the Baltics",
    shape: "pine",
  },
  {
    keys: ["georgia", "armenia", "azerbaijan", "tbilisi", "yerevan", "baku"],
    species: "Caucasian walnut",
    region: "the Caucasus",
    shape: "walnut",
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
    shape: "apple",
  },
  {
    keys: ["papua", "new guinea", "solomon", "vanuatu"],
    species: "Klinki pine",
    region: "New Guinea",
    shape: "spruce",
  },
  {
    keys: ["nigeria", "ghana", "lagos", "accra"],
    species: "Iroko",
    region: "West Africa",
    shape: "iroko",
  },
  {
    keys: ["congo", "cameroon", "gabon"],
    species: "African mahogany",
    region: "Central Africa",
    shape: "mahogany",
  },
  {
    keys: ["egypt", "cairo", "alexandria"],
    species: "Sycamore fig",
    region: "Egypt",
    shape: "sycamore-fig",
  },
  {
    keys: ["morocco", "algeria", "tunisia", "libya"],
    species: "Argan",
    region: "North Africa",
    shape: "argan",
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
    shape: "banyan",
  },
  {
    keys: ["pakistan", "karachi", "lahore", "sindh", "punjab"],
    species: "Neem",
    region: "Pakistan",
    shape: "neem",
  },
  {
    keys: ["bangladesh", "dhaka", "bengal"],
    species: "Jackfruit",
    region: "Bangladesh",
    shape: "obovate",
  },
  {
    keys: ["sri lanka", "ceylon", "colombo"],
    species: "Ironwood",
    region: "Sri Lanka",
    shape: "ironwood",
  },
  {
    keys: ["nepal", "kathmandu", "bhutan"],
    species: "Rhododendron",
    region: "Nepal",
    shape: "rhododendron",
  },
  {
    keys: ["iran", "persia", "tehran"],
    species: "Oriental plane",
    region: "Iran",
    shape: "plane",
  },
  {
    keys: ["iraq", "mesopotamia", "baghdad"],
    species: "Date palm",
    region: "Iraq",
    shape: "palm",
  },
  {
    keys: ["lebanon", "syria", "beirut", "damascus"],
    species: "Cedar of Lebanon",
    region: "Lebanon",
    shape: "cedar",
  },
  {
    keys: ["israel", "palestine", "jerusalem", "jaffa"],
    species: "Olive",
    region: "the Levant",
    shape: "olive",
  },
  {
    keys: ["turkey", "ottoman", "istanbul", "constantinople"],
    species: "Oriental plane",
    region: "Turkey",
    shape: "plane",
  },
  {
    keys: ["afghanistan", "kabul"],
    species: "Chinar",
    region: "Afghanistan",
    shape: "plane",
  },
  // East and Southeast Asia
  {
    keys: ["japan", "tokyo", "osaka", "kyoto"],
    species: "Japanese maple",
    region: "Japan",
    shape: "japanese-maple",
  },
  {
    keys: ["china", "hong kong", "shanghai", "beijing", "canton", "guangzhou"],
    species: "White mulberry",
    region: "China",
    shape: "mulberry",
  },
  {
    keys: ["korea", "seoul"],
    species: "Zelkova",
    region: "Korea",
    shape: "zelkova",
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
    shape: "teak",
  },
  {
    keys: ["malaysia", "singapore", "indonesia", "java", "borneo", "sumatra"],
    species: "Rain tree",
    region: "the Malay world",
    shape: "rain-tree",
  },
  {
    keys: ["philippines", "manila"],
    species: "Narra",
    region: "the Philippines",
    shape: "narra",
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
    shape: "chestnut",
  },
  {
    keys: ["germany", "austria", "berlin", "vienna"],
    species: "Small-leaved lime",
    region: "Germany",
    shape: "lime",
  },
  {
    keys: ["netherlands", "holland", "belgium", "amsterdam", "brussels"],
    species: "Common beech",
    region: "the Low Countries",
    shape: "beech",
  },
  {
    keys: ["spain", "portugal", "madrid", "lisbon"],
    species: "Holm oak",
    region: "Iberia",
    shape: "holm-oak",
  },
  {
    keys: ["italy", "rome", "sicily"],
    species: "Olive",
    region: "Italy",
    shape: "olive",
  },
  {
    keys: ["greece", "cyprus", "athens"],
    species: "Olive",
    region: "Greece",
    shape: "olive",
  },
  {
    keys: ["sweden", "norway", "finland", "denmark", "iceland"],
    species: "Silver birch",
    region: "Scandinavia",
    shape: "birch",
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
    shape: "lime",
  },
  {
    keys: ["russia", "ukraine", "belarus", "moscow", "kyiv", "kiev", "siberia"],
    species: "Siberian birch",
    region: "Russia",
    shape: "birch",
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
    shape: "red-oak",
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
    shape: "ceiba",
  },
  {
    keys: ["brazil", "rio de janeiro", "sao paulo"],
    species: "Brazilwood",
    region: "Brazil",
    shape: "rain-tree",
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
    shape: "ceibo",
  },
  {
    keys: ["australia", "sydney", "melbourne", "perth", "brisbane"],
    species: "Eucalyptus",
    region: "Australia",
    shape: "eucalyptus",
  },
  {
    keys: ["new zealand", "auckland", "wellington"],
    species: "Pohutukawa",
    region: "New Zealand",
    shape: "oblong",
  },
  {
    keys: ["fiji", "samoa", "tonga"],
    species: "Ivi",
    region: "the Pacific Islands",
    shape: "oblong",
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
