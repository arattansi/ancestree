/**
 * What a join page shows of the tree it joins (Step 215, F4 of the
 * 2026-10-27 drop-off audit). Anyone holding the link may open it, so
 * Aalim set what it may show (2026-10-27): everyone on the tree as an
 * unnamed leaf in their birthplace's species, in rows by generation — no
 * names, faces or dates — with the inviter's leaf marked, and on a claim
 * link the claimed one too; what that entry is to the inviter, in the
 * story-credit words (Step 99); and the inviter's own photo. Pure; the
 * database hands over what it's worked out from (`invite_glimpse`) and
 * `lib/invite-glimpse.server.ts` reads it.
 */

import { relationOf, type ConnectionRelationship } from "@/lib/connection-path";
import { nativeLeaf, type LeafShape } from "@/lib/native-leaf";
import { countOf } from "@/lib/plural";
import { layoutTree } from "@/lib/tree-layout";

/** Who someone on the tree is, as `invite_glimpse` gives them. */
export type GlimpsePerson = {
  id: string;
  sex: string | null;
  city_of_birth: string | null;
  country_of_birth: string | null;
  date_of_birth: string | null;
  /** Hidden from visitors (Step 25): a plain leaf, nothing of where. */
  hidden: boolean;
};

/** `invite_glimpse`'s answer for a live invite into a tree. */
export type GlimpseInput = {
  inviterPersonId: string | null;
  inviterSex: string | null;
  inviterLastName: string | null;
  inviterMaidenName: string | null;
  /** Left out when the inviter hides their entry from visitors. */
  inviterPhotoPath: string | null;
  inviterPhotoCrop: unknown;
  claimPersonId: string | null;
  people: GlimpsePerson[];
  lines: ConnectionRelationship[];
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

/** `invite_glimpse`'s jsonb, or null for anything else (no live invite). */
export function asGlimpseInput(value: unknown): GlimpseInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const list = (v: unknown) =>
    (Array.isArray(v) ? v : []).filter(
      (x): x is Record<string, unknown> => !!x && typeof x === "object",
    );
  const people = list(raw.people).flatMap((p): GlimpsePerson[] => {
    const id = text(p.id);
    return id
      ? [
          {
            id,
            sex: text(p.sex),
            city_of_birth: text(p.city_of_birth),
            country_of_birth: text(p.country_of_birth),
            date_of_birth: text(p.date_of_birth),
            hidden: p.hidden === true,
          },
        ]
      : [];
  });
  const lines = list(raw.lines).flatMap((l): ConnectionRelationship[] => {
    const [from, to, type] = [text(l.from_person), text(l.to_person), text(l.type)];
    return from && to && type
      ? [{ from_person: from, to_person: to, type, is_divorced: l.is_divorced === true }]
      : [];
  });
  return {
    inviterPersonId: text(raw.inviter_person_id),
    inviterSex: text(raw.inviter_sex),
    inviterLastName: text(raw.inviter_last_name),
    inviterMaidenName: text(raw.inviter_maiden_name),
    inviterPhotoPath: text(raw.inviter_photo_path),
    inviterPhotoCrop: raw.inviter_photo_crop ?? null,
    claimPersonId: text(raw.claim_person_id),
    people,
    lines,
  };
}

/** One leaf of the picture: its shape, and whose it is if anyone's is said. */
export type GlimpseLeaf = { shape: LeafShape; mark: "inviter" | "you" | null };

/**
 * One generation, eldest at the top, in the canvas's left-to-right order.
 * A row too long to draw shows the leaves round a marked one (or its
 * middle), and how many it left out either side.
 */
export type GlimpseRow = { leaves: GlimpseLeaf[]; before: number; after: number };

/** The most leaves a row draws, the most rows the picture has. */
export const GLIMPSE_ROW_LEAVES = 14;
export const GLIMPSE_ROWS = 7;

/**
 * Which `count` of `length` to show: those round `focus`, kept inside.
 */
function windowOf(length: number, count: number, focus: number): [number, number] {
  if (length <= count) return [0, length];
  const start = Math.min(Math.max(0, focus - Math.floor(count / 2)), length - count);
  return [start, start + count];
}

/**
 * The picture's rows: everyone on the tree, laid out as the canvas lays
 * them out (centred on the inviter), read off row by row. The leaf is the
 * one their birthplace gives them (`nativeLeaf`), a plain one for anyone
 * hidden from visitors. Leaves are all drawn alike otherwise: nothing says
 * who has died.
 */
export function glimpseRows(input: GlimpseInput): GlimpseRow[] {
  if (input.people.length === 0) return [];
  const layout = layoutTree(input.people.map((p) => ({ ...p, pos_x: null, pos_y: null })), input.lines, {
    anchorIds: input.inviterPersonId ? [input.inviterPersonId] : [],
  });
  const byGeneration = new Map<number, { id: string; x: number }[]>();
  for (const p of input.people) {
    const generation = layout.generations.get(p.id) ?? 0;
    const x = layout.positions.get(p.id)?.x ?? 0;
    const row = byGeneration.get(generation);
    if (row) row.push({ id: p.id, x });
    else byGeneration.set(generation, [{ id: p.id, x }]);
  }
  const markOf = (id: string): GlimpseLeaf["mark"] =>
    id === input.inviterPersonId ? "inviter" : id === input.claimPersonId ? "you" : null;
  const personById = new Map(input.people.map((p) => [p.id, p]));
  const shapeOf = (id: string): LeafShape => {
    const p = personById.get(id);
    return nativeLeaf(p && !p.hidden ? p : {}).shape;
  };

  const generations = [...byGeneration.keys()].sort((a, b) => a - b);
  const markedRow = generations.findIndex((g) =>
    byGeneration.get(g)!.some((p) => markOf(p.id)),
  );
  const [firstRow, lastRow] = windowOf(
    generations.length,
    GLIMPSE_ROWS,
    markedRow === -1 ? Math.floor(generations.length / 2) : markedRow,
  );
  return generations.slice(firstRow, lastRow).map((g) => {
    const row = byGeneration.get(g)!.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
    const marked = row.findIndex((p) => markOf(p.id));
    // A cut row gives a leaf's room on each cut side to its count.
    let [start, end] = windowOf(
      row.length,
      GLIMPSE_ROW_LEAVES,
      marked === -1 ? Math.floor(row.length / 2) : marked,
    );
    if (start > 0) start += 1;
    if (end < row.length) end -= 1;
    return {
      leaves: row.slice(start, end).map((p) => ({ shape: shapeOf(p.id), mark: markOf(p.id) })),
      before: start,
      after: row.length - end,
    };
  });
}

/**
 * What a claim link's entry is to whoever sent it, as the sentence says
 * it: "his wife", "her great-grandson", "their first cousin once
 * removed" — the inviter's pronoun from the sex on their entry. Null when
 * there's no claim, the inviter has no entry on the tree, or nothing with
 * an everyday name joins them.
 */
export function claimRelation(input: GlimpseInput): string | null {
  const { claimPersonId: you, inviterPersonId: inviter } = input;
  if (!you || !inviter) return null;
  const people = new Map(input.people.map((p) => [p.id, { sex: p.sex }]));
  const relation = relationOf(you, inviter, people, input.lines);
  if (!relation || !("term" in relation)) return null;
  const term = relation.term.charAt(0).toLowerCase() + relation.term.slice(1);
  const pronoun =
    input.inviterSex === "male" ? "his" : input.inviterSex === "female" ? "her" : "their";
  return `${pronoun} ${term}`;
}

/**
 * How many are on the tree, under its picture: "14 people are on it, and 3
 * have joined." A count, never who (Step 163). A tree with nobody on it but
 * the inviter, or no one at all, has no picture, and the sentence before
 * has named the inviter already (maybe twice, "Leila Haddad invited you to
 * help build Leila's family tree"): "It's just been started."
 */
export function glimpseCount(input: {
  people: number;
  members: number | null | undefined;
}): string {
  if (input.people <= 1) return "It’s just been started.";
  const people = `${countOf(input.people, "person", "people")} are on it`;
  return (input.members ?? 0) >= 2
    ? `${people}, and ${input.members} have joined.`
    : `${people} so far.`;
}

/** What `invite_preview` calls an inviter with no display name. */
export const UNNAMED_INVITER = "A family member";

/** A display name's first word: "Chidi" of "Chidi Okafor". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
