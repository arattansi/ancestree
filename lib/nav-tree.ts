import { NAV_GAP, NAV_WORDS, type NavWord } from "@/lib/nav-words";

/**
 * The open menu laid out as a tree (an experiment, 2026-10-05). The canopy,
 * in the brand's green: **why** at the very top, **what + how** across
 * beneath it, and **who** and **shh** below that, either side of the
 * trunk. The trunk, in the brand's brown: **capitalism** turned on its
 * side to stand upright, read from the ground up. The page you're on is
 * encircled.
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

const trunkW = byId.capitalism.height;
const trunkH = byId.capitalism.width;
/** who, a gap, the trunk, a gap, shh. */
const WIDTH = byId.who.width + NAV_GAP + trunkW + NAV_GAP + byId.shh.width;
const trunkX = byId.who.width + NAV_GAP;
const axis = trunkX + trunkW / 2;
const onAxis = (w: number) => Math.round(axis - w / 2);

const whyY = 0;
const whatHowY = byId.why.height + NAV_GAP;
const trunkY = whatHowY + byId["what-how"].height + NAV_GAP;

export const NAV_TREE: NavTreeWord[] = [
  place("who", "canopy", 0, trunkY),
  place("what-how", "canopy", onAxis(byId["what-how"].width), whatHowY),
  place("why", "canopy", onAxis(byId.why.width), whyY),
  place("capitalism", "trunk", trunkX, trunkY, true),
  place("shh", "canopy", WIDTH - byId.shh.width, trunkY),
];

export const NAV_TREE_SIZE = {
  width: WIDTH,
  height: trunkY + trunkH,
};
