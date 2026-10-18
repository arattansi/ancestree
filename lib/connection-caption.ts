import {
  connectionPath,
  relationAlong,
  type ConnectionPath,
  type ConnectionRelationship,
} from "@/lib/connection-path";
import { personDisplayName, type NamedPerson } from "@/lib/person-name";

/**
 * How the leaf on the iPhone app's leaf view is connected to the member, in
 * a few words (Step 185): "Your mother's father", "Your wife's sister", so
 * that after a few walks they still know where they are.
 *
 * Two links or fewer say each link, which keeps the side a grandparent is
 * on. A longer chain is named whole when it has one word ("Your
 * great-great-grandfather", "Your first cousin"), else in two words
 * ("Your wife's first cousin", "Your sister-in-law's husband"), with at
 * most one in-law between them. Past that it names the nearest person on
 * the chain the member could be told about: "Karim's mother", or "Related
 * through Karim" when even that piece has no word. Null on their own leaf,
 * or when nothing on their trees joins them.
 */

export type CaptionPerson = NamedPerson & { sex?: string | null };

export function connectionCaption(
  selfId: string,
  focusId: string,
  people: ReadonlyMap<string, CaptionPerson>,
  relationships: ConnectionRelationship[],
): string | null {
  if (selfId === focusId || !people.has(selfId) || !people.has(focusId)) return null;
  // From the leaf to the member: each piece of it then names what its first
  // person is to its last, as `relationAlong` reads a chain.
  const path = connectionPath(focusId, selfId, relationships);
  if (!path) return null;
  const n = path.people.length - 1;
  const named = captionAlong(path, people, relationships);
  if (named) return named;

  // The nearest the member could be told about: from the leaf's side in.
  for (let k = 1; k < n; k++) {
    if (!captionAlong(piece(path, k, n), people, relationships)) continue;
    const through = people.get(path.people[k]);
    const name = through ? firstName(through) : "someone";
    const rest = term(piece(path, 0, k), people, relationships);
    return rest ? `${name}'s ${rest}` : `Related through ${name}`;
  }
  return null;
}

/** The caption for a whole chain, read from the leaf to the member, or
 *  null when it has no short enough name. */
function captionAlong(
  path: ConnectionPath,
  people: ReadonlyMap<string, CaptionPerson>,
  relationships: ConnectionRelationship[],
): string | null {
  const n = path.people.length - 1;
  const say = (pieces: string[]) => `Your ${pieces.join("'s ")}`;

  // Each link a word: up, down, a marriage, or a sibling, whether through
  // the parent they share (up, then down) or a stored sibling row.
  const joints = [0];
  for (let i = 0; i < path.steps.length; ) {
    const pair = path.steps[i].kind === "up" && path.steps[i + 1]?.kind === "down";
    i += pair ? 2 : 1;
    joints.push(i);
  }
  if (joints.length <= 3) {
    const words: (string | null)[] = [];
    for (let j = joints.length - 1; j > 0; j--)
      words.push(term(piece(path, joints[j - 1], joints[j]), people, relationships));
    if (words.every((w): w is string => !!w)) return say(words);
  }

  const whole = term(path, people, relationships);
  if (whole) return say([whole]);

  // Two words, joined where the fewest in-laws come of it, then where the
  // leaf's own piece is shortest: "your sister-in-law's husband" rather
  // than "your wife's brother-in-law".
  let best: { words: string[]; inLaws: number } | null = null;
  for (let k = 1; k < n; k++) {
    const near = term(piece(path, k, n), people, relationships);
    const far = term(piece(path, 0, k), people, relationships);
    if (!near || !far) continue;
    const inLaws = [near, far].filter(isInLaw).length;
    if (inLaws > 1) continue;
    if (!best || inLaws < best.inLaws) best = { words: [near, far], inLaws };
  }
  return best ? say(best.words) : null;
}

/** The people `from` to `to` on a chain, and the steps between them. */
function piece(path: ConnectionPath, from: number, to: number): ConnectionPath {
  return {
    people: path.people.slice(from, to + 1),
    steps: path.steps.slice(from, to),
    coParents: [],
  };
}

/**
 * What a piece's first person is to its last, in one word, lower-case:
 * "father", "first cousin", "sister-in-law". None for a chain with no
 * word, a "… by marriage" (two pieces say it better: "your wife's first
 * cousin"), or a co-parent ("your son's mother" says who).
 */
function term(
  path: ConnectionPath,
  people: ReadonlyMap<string, CaptionPerson>,
  relationships: ConnectionRelationship[],
): string | null {
  const relation = relationAlong(path, people, relationships);
  if (!("term" in relation)) return null;
  const word = relation.term.charAt(0).toLowerCase() + relation.term.slice(1);
  if (word.endsWith(" by marriage") || word === "co-parent") return null;
  // Three greats or more as genealogists count them: "3rd great-grandfather".
  return word.replace(/^(?:great-){3,}/, (greats) => `${ordinal(greats.length / 6)} great-`);
}

const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
};

const isInLaw = (word: string) => word.includes("-in-law") || word.startsWith("step");

/** As the person view's chain names them: what they go by, first. */
function firstName(p: CaptionPerson): string {
  return (p.preferred_name || p.first_name || "").trim() || personDisplayName(p);
}
