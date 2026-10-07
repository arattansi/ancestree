import { NAV_WORDS, type NavWord } from "@/lib/nav-words";

/**
 * The open menu laid out as a tree (Step 133; redrawn by Aalim with
 * **library** in Step 136, and traced from his drawing, so every word
 * sits where he put it). The canopy, in the brand's green: **why** at the
 * very top, **library** beneath it, **what + how** across beneath that,
 * and **who** and **shh** below, either side of the trunk. The trunk, in
 * the brand's brown: **capitalism** turned on its side to stand upright,
 * read from the ground up. The page you're on is encircled.
 *
 * Places are in the drawing's pixels, as `NAV_WORDS` are, inside
 * `NAV_TREE_SIZE`. A `turned` word's box is its drawn box on its side.
 */
export type NavTreeWord = NavWord & {
  part: "canopy" | "trunk";
  /** Drawn a quarter turn anticlockwise, reading upwards. */
  turned?: boolean;
};

const byId = Object.fromEntries(NAV_WORDS.map((w) => [w.id, w]));

function place(
  id: string,
  part: NavTreeWord["part"],
  x: number,
  y: number,
  turned = false,
): NavTreeWord {
  const word = byId[id];
  return turned
    ? { ...word, part, turned, x, y, width: word.height, height: word.width }
    : { ...word, part, x, y };
}

export const NAV_TREE: NavTreeWord[] = [
  place("why", "canopy", 79, 0),
  place("library", "canopy", 57, 64),
  place("what-how", "canopy", 9, 117),
  place("who", "canopy", 0, 184),
  place("capitalism", "trunk", 94, 178, true),
  place("shh", "canopy", 163, 190),
];

export const NAV_TREE_SIZE = { width: 243, height: 365 };

