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
