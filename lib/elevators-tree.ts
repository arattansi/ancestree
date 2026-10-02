/**
 * The family behind the marketing pages (Step 107): a faded spotlight of
 * leaves, a nod to OutKast's "Elevators (Me & You)". Each leaf says how
 * they're related ("me", "you", "your momma"); hovering one shows a made-up
 * name, as the canvas's leaf shows a real one.
 *
 * Aalim named the first seven and "your cousin's boo"; "your sis" follows
 * the same idea: a first name and a surname borrowed from writers,
 * thinkers, artists and leaders, a married-in name kept as "née". "me" and
 * "you" are the two Roots at the base, and the family grows out of "you":
 * your momma and poppa above, your auntie (momma's sister) and unc beside
 * them, your cousin, too, theirs, with their boo on the far side.
 *
 * Laid out on the canvas's own grid (`lib/tree-dimensions.ts`) as a pulled-
 * out line is: partners `COUPLE_GAP` apart, everyone else at least
 * `GUTTER`, each family centred under its parents' trunk, and sisters with
 * no parents on the tree joined by a bracket over the row. One thing the
 * canvas wouldn't do: me and you sit `PAGE_ROOM` under the parents rather
 * than a row's gap, so a page's own words land between the generations
 * instead of on a leaf.
 */

import type { AccountTypeKey } from "@/lib/account-types";
import { COUPLE_GAP, GUTTER, NODE_H, NODE_W } from "@/lib/tree-dimensions";

export type ElevatorsPerson = {
  id: string;
  /** What the leaf says: how they're related to "you". */
  label: string;
  first: string;
  last: string;
  maiden: string | null;
  city: string;
  /** Picks the leaf, as a real birthplace does (`lib/native-leaf.ts`). */
  country: string;
  account: AccountTypeKey | null;
  /** The leaf's card box, top-left, in canvas pixels. */
  x: number;
  y: number;
};

/** A couple and the children their trunk carries. */
export type ElevatorsFamily = { parents: [string, string]; children: string[] };

/** The gap between the parents' row and me and you, where a page's words go. */
const PAGE_ROOM = 440;
const BASE_Y = NODE_H + PAGE_ROOM;

/** The middle of that gap: what the backdrop puts in the middle of a page. */
export const ELEVATORS_FOCUS_Y = NODE_H + PAGE_ROOM / 2;

// Row by row, left to right. Each couple's children sit centred under the
// middle of the gap between them, so every trunk drops straight. Momma is
// on her side's outside, so the bracket to her sister rises clear of the
// trunk down to you.
const MOMMA_X = 0;
const AUNTIE_X = MOMMA_X + 2 * NODE_W + COUPLE_GAP + GUTTER;
const YOU_X = MOMMA_X + NODE_W + COUPLE_GAP / 2 - NODE_W - GUTTER / 2;
const COUSIN_X = AUNTIE_X + NODE_W + COUPLE_GAP / 2 - NODE_W / 2;

export const ELEVATORS_PEOPLE: ElevatorsPerson[] = [
  {
    id: "momma",
    label: "your momma",
    first: "Rumi",
    last: "Baldwin",
    maiden: "Morrison",
    city: "Balkh",
    country: "Afghanistan",
    account: "branch_admin",
    x: MOMMA_X,
    y: 0,
  },
  {
    id: "poppa",
    label: "your poppa",
    first: "René",
    last: "Baldwin",
    maiden: null,
    city: "Touraine",
    country: "France",
    account: "branch_admin",
    x: MOMMA_X + NODE_W + COUPLE_GAP,
    y: 0,
  },
  {
    id: "auntie",
    label: "your auntie",
    first: "Laila",
    last: "Curie",
    maiden: "Skłodowska",
    city: "Warsaw",
    country: "Poland",
    account: "member",
    x: AUNTIE_X,
    y: 0,
  },
  {
    id: "unc",
    label: "your unc",
    first: "Stone",
    last: "Curie",
    maiden: null,
    city: "Paris",
    country: "France",
    account: null,
    x: AUNTIE_X + NODE_W + COUPLE_GAP,
    y: 0,
  },
  {
    id: "me",
    label: "me",
    first: "Antwan",
    last: "Oswalt",
    maiden: null,
    city: "Savannah",
    country: "United States",
    account: "admin",
    x: YOU_X - NODE_W - COUPLE_GAP,
    y: BASE_Y,
  },
  {
    id: "you",
    label: "you",
    first: "André",
    last: "Franklin",
    maiden: null,
    city: "Atlanta",
    country: "United States",
    account: "admin",
    x: YOU_X,
    y: BASE_Y,
  },
  {
    id: "sis",
    label: "your sis",
    first: "Frida",
    last: "Baldwin",
    maiden: null,
    city: "Coyoacán",
    country: "Mexico",
    account: "member",
    x: YOU_X + NODE_W + GUTTER,
    y: BASE_Y,
  },
  {
    id: "cousin",
    label: "your cousin, too",
    first: "Tito",
    last: "ibn Sina",
    maiden: null,
    city: "Bukhara",
    country: "Uzbekistan",
    account: "member",
    x: COUSIN_X,
    y: BASE_Y,
  },
  {
    id: "cousins-boo",
    label: "your cousin’s boo",
    first: "Kong",
    last: "Lumumba",
    maiden: null,
    city: "Onalua",
    country: "Congo",
    account: "member",
    x: COUSIN_X + NODE_W + COUPLE_GAP,
    y: BASE_Y,
  },
];

/** Partners, left then right: a level line between them. */
export const ELEVATORS_COUPLES: [string, string][] = [
  ["momma", "poppa"],
  ["auntie", "unc"],
  ["me", "you"],
  ["cousin", "cousins-boo"],
];

export const ELEVATORS_FAMILIES: ElevatorsFamily[] = [
  { parents: ["momma", "poppa"], children: ["you", "sis"] },
  { parents: ["auntie", "unc"], children: ["cousin"] },
];

/** Sisters whose parents aren't on the tree: a dashed bracket (Step 19.3). */
export const ELEVATORS_SIBLINGS: [string, string][] = [["momma", "auntie"]];

/**
 * Room left around the leaves: a blade overhangs its card box, a bracket
 * rises over its row, and the account mark hangs under the leaf.
 */
const MARGIN = { x: 96, top: 72, bottom: 112 };

/** The canvas the family is drawn on, with every leaf's room inside it. */
export const ELEVATORS_BOUNDS = (() => {
  const xs = ELEVATORS_PEOPLE.map((p) => p.x);
  const ys = ELEVATORS_PEOPLE.map((p) => p.y);
  const left = Math.min(...xs) - MARGIN.x;
  const top = Math.min(...ys) - MARGIN.top;
  return {
    left,
    top,
    width: Math.max(...xs) + NODE_W + MARGIN.x - left,
    height: Math.max(...ys) + NODE_H + MARGIN.bottom - top,
  };
})();

/** The middle of me and you: what a phone, too narrow for everyone, keeps. */
export const ELEVATORS_BASE_X = YOU_X - COUPLE_GAP / 2;

export function elevatorsPerson(id: string): ElevatorsPerson {
  const person = ELEVATORS_PEOPLE.find((p) => p.id === id);
  if (!person) throw new Error(`No one called ${id} in the Elevators tree`);
  return person;
}
