/**
 * What a tree is called before anyone names it. The first tree someone has
 * is "Family"; each one after that counts up — "Second Family", "Third
 * Family" — so a fresh tree is never mistaken for one they already have. A
 * Root renames it whenever they like. Mirrored in SQL as
 * `private.default_tree_name`, which names the tree a founder invite plants.
 */

const ORDINAL_WORDS = [
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
  "Tenth",
];

function ordinalSuffix(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/**
 * The default name for someone's next tree, given how many they are already
 * on. Zero gives "Family"; one gives "Second Family"; past "Tenth" it counts
 * in figures ("11th Family").
 */
export function defaultTreeName(existingTrees: number): string {
  const existing = Math.max(0, Math.floor(existingTrees));
  if (existing === 0) return "Family";
  const word = ORDINAL_WORDS[existing - 1];
  if (word) return `${word} Family`;
  const n = existing + 1;
  return `${n}${ordinalSuffix(n)} Family`;
}

/**
 * Whether a tree still has a name `defaultTreeName` gave it — nobody has
 * named it yet. The founder's first run offers to (Step 29).
 */
export function isDefaultTreeName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed === "Family") return true;
  const ordinal = /^(\S+) Family$/.exec(trimmed)?.[1];
  if (!ordinal) return false;
  if (ORDINAL_WORDS.includes(ordinal)) return true;
  const figures = /^(\d+)(st|nd|rd|th)$/.exec(ordinal);
  if (!figures) return false;
  const n = Number(figures[1]);
  return n > ORDINAL_WORDS.length + 1 && figures[2] === ordinalSuffix(n);
}

/**
 * What to offer a founder in place of a default name: their family's name,
 * "The Garcia Family". A maiden name comes first — someone who married in
 * and starts a tree is starting their own side — and a name one of their
 * other trees already has is passed over, so two trees they're on never
 * share a name. `null` when there's nothing better than the default.
 */
export function suggestedTreeName(
  names: { maidenName?: string | null; lastName?: string | null },
  taken: readonly string[] = [],
): string | null {
  const used = new Set(taken.map((n) => n.trim().toLowerCase()));
  for (const family of [names.maidenName, names.lastName]) {
    const trimmed = (family ?? "").trim();
    if (!trimmed) continue;
    const name = `The ${trimmed} Family`;
    if (!used.has(name.toLowerCase())) return name;
  }
  return null;
}
