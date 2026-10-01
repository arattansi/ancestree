/**
 * The weekly newsletter (Step 95): what each member hears on Sunday — who
 * was added to each of their trees, the stories and album photos approved
 * that week, and what's coming up.
 *
 * Personal, not per tree (Aalim, 2026-10-01: Karim Kanji doesn't care about
 * the Suleman side of the Rattansi-Suleman tree): only the people on the
 * member's My Family Tree count — their blood relatives on both parents'
 * sides, their spouse, and whoever married into the family, never the
 * families of those who married in (`familyTies`, Step 94). It is gathered
 * from the trees they're a member of, as My Family Tree is, and each
 * addition still says which tree it was made on.
 *
 * Coming up is the Upcoming card's list (`upcomingOccasions`): the next
 * seven days' birthdays and anniversaries, today included, and past them,
 * up to four weeks out, only the round ones (`isMilestone`), so there's
 * time to plan. The dead stay out, as on the card, and so do the reader's
 * own birthday and anniversary.
 *
 * Pure: `lib/newsletter.server.ts` reads the trees with the service role,
 * as their members see them, and sends what this returns.
 */

import {
  familyTies,
  mergeLines,
  mergeShowings,
  type FamilyLine,
  type Showing,
} from "@/lib/my-family";
import {
  upcomingOccasions,
  WEEK_DAYS,
  type Occasion,
  type OccasionPerson,
} from "@/lib/occasions";
import { coupleDisplayName, personDisplayName } from "@/lib/person-name";

/** How far ahead a round birthday or anniversary is named: four weeks. */
export const MILESTONE_DAYS = 28;

/**
 * A round number worth planning for: a first birthday, 18, 21, every ten
 * from 30 and every year from 100; a first anniversary, the 25th, 75th and
 * every ten. Nothing without a known year.
 */
export function isMilestone(o: Pick<Occasion, "kind" | "years">): boolean {
  const y = o.years;
  if (y === null || y < 1) return false;
  if (o.kind === "birthday") {
    return y === 1 || y === 18 || y === 21 || (y >= 30 && y % 10 === 0) || y >= 100;
  }
  return y === 1 || y === 25 || y === 75 || y % 10 === 0;
}

/** What the newsletter reads off a card: a name, and its dates. */
export type IssuePerson = OccasionPerson & {
  first_name: string | null;
  preferred_name: string | null;
  last_name: string;
};

/** A card being placed on a tree: when, and by whom. */
export type IssuePlacement = {
  tree_id: string;
  person_id: string;
  /** The member who placed it; null once they've left every tree. */
  placed_by: string | null;
  created_at: string;
};

/** Someone named in the newsletter, linked to their card. */
export type IssueName = { id: string; name: string };

/** Whoever added people to a tree that week, and whom. */
export type IssueAdded = {
  /** The member's name, or null when nobody is recorded. */
  by: string | null;
  /** The reader themselves. */
  byYou: boolean;
  /** In the order they were added. */
  people: IssueName[];
};

/** What happened on one of the reader's trees that week. */
export type IssueTree = {
  id: string;
  name: string;
  /** Members who brought their own entry here that week: they joined. */
  joined: IssueName[];
  added: IssueAdded[];
  /** People with a story approved that week, each once. */
  stories: IssueName[];
  /** People in an album photo approved that week, each once. */
  photos: IssueName[];
};

/** A birthday or anniversary, named. */
export type IssueOccasion = Occasion & {
  /** "Amina Khan", or the couple: "Ahmed & Sara Khan". */
  name: string;
  /** A round number (`isMilestone`). */
  milestone: boolean;
};

export type Issue = {
  /** Only the trees with something to say, in the order the reader joined. */
  trees: IssueTree[];
  /** The next seven days, today included. */
  week: IssueOccasion[];
  /** Round ones after that, up to four weeks out. */
  later: IssueOccasion[];
};

export type IssueInput<R extends IssuePerson & { id: string }> = {
  /** The reader's account. */
  userId: string;
  /** Their own entry: My Family Tree is arranged around it. */
  selfId: string;
  /** The trees they're a member of, in the order they joined. */
  trees: readonly { id: string; name: string }[];
  /** Every one of those trees' showings of everyone. */
  showings: readonly Showing<R>[];
  /** Every line those trees draw (each tree's copy; merged here). */
  lines: readonly FamilyLine[];
  /** Placements on those trees, at least those since `since`. */
  placements: readonly IssuePlacement[];
  /** Whose stories were approved since `since`. */
  stories: readonly { person_id: string }[];
  /** Album photos approved since `since`, by who's in them. */
  photos: readonly { photo_id: string; person_id: string }[];
  /** Members' names, by user id: their own entry's, else the one they set. */
  memberNames: ReadonlyMap<string, string>;
  /** Members' own entries, by user id: placing one is joining. */
  memberEntries: ReadonlyMap<string, string>;
  /** The start of the week being told: an ISO timestamp. */
  since: string;
  /** Today, `YYYY-MM-DD`. */
  today: string;
};

/**
 * The reader's newsletter, or null when there's nothing to tell: no entry
 * of their own on their trees to arrange it around, or a quiet week with
 * nothing coming up.
 */
export function weeklyIssue<R extends IssuePerson & { id: string }>(
  input: IssueInput<R>,
): Issue | null {
  const treeIds = input.trees.map((t) => t.id);
  const mine = new Set(treeIds);
  const cards = mergeShowings(
    input.showings.filter((s) => mine.has(s.treeId)),
    treeIds,
  );
  if (!cards.has(input.selfId)) return null;
  const lines = mergeLines(input.lines);
  const ties = familyTies(input.selfId, lines);
  const inFamily = (id: string) => ties.has(id) && cards.has(id);
  const nameOf = (id: string) => personDisplayName(cards.get(id)!.row);
  const since = Date.parse(input.since);

  const byTree = new Map<string, IssueTree>(
    input.trees.map((t) => [
      t.id,
      { id: t.id, name: t.name, joined: [], added: [], stories: [], photos: [] },
    ]),
  );

  // Additions, oldest first; a card placed on two of their trees is news
  // on both. Their own entry arriving somewhere isn't news to them.
  const placed = input.placements
    .filter(
      (p) =>
        mine.has(p.tree_id) &&
        p.person_id !== input.selfId &&
        inFamily(p.person_id) &&
        Date.parse(p.created_at) >= since,
    )
    .sort(
      (a, b) =>
        Date.parse(a.created_at) - Date.parse(b.created_at) ||
        nameOf(a.person_id).localeCompare(nameOf(b.person_id)),
    );
  for (const p of placed) {
    const tree = byTree.get(p.tree_id)!;
    // A member placing their own entry is them joining, not news of whom
    // they added.
    if (p.placed_by && input.memberEntries.get(p.placed_by) === p.person_id) {
      if (!tree.joined.some((n) => n.id === p.person_id)) {
        tree.joined.push({ id: p.person_id, name: nameOf(p.person_id) });
      }
      continue;
    }
    const byYou = p.placed_by === input.userId;
    const by = byYou
      ? null
      : (p.placed_by && input.memberNames.get(p.placed_by)) || null;
    let group = tree.added.find((g) => g.byYou === byYou && g.by === by);
    if (!group) {
      group = { by, byYou, people: [] };
      tree.added.push(group);
    }
    if (!group.people.some((n) => n.id === p.person_id)) {
      group.people.push({ id: p.person_id, name: nameOf(p.person_id) });
    }
  }

  // A story or a photo is seen only where its person is shown in full
  // (`private.can_see_stories`), so it goes under one such tree: the
  // card's own when it's full there.
  const fullTreeOf = (id: string): string | null => {
    const card = cards.get(id);
    if (!card || card.fullTreeIds.length === 0) return null;
    return card.fullTreeIds.includes(card.treeId)
      ? card.treeId
      : card.fullTreeIds[0];
  };
  const mention = (list: "stories" | "photos", personId: string) => {
    if (!inFamily(personId)) return;
    const treeId = fullTreeOf(personId);
    const tree = treeId ? byTree.get(treeId) : undefined;
    if (!tree || tree[list].some((n) => n.id === personId)) return;
    tree[list].push({ id: personId, name: nameOf(personId) });
  };
  for (const s of input.stories) mention("stories", s.person_id);
  for (const p of input.photos) mention("photos", p.person_id);

  // Birthdays and anniversaries of everyone in, as their cards show them:
  // a basic card has no dates to give.
  const people: R[] = [];
  for (const [id, card] of cards) {
    if (ties.has(id) && card.fullTreeIds.length > 0) people.push(card.row);
  }
  // Not their own birthday or anniversary: they know.
  const occasions = upcomingOccasions(people, lines, input.today, {
    within: MILESTONE_DAYS,
    nameOf,
  })
    .filter((o) => !o.people.includes(input.selfId))
    .map(
      (o): IssueOccasion => ({
        ...o,
        name:
          o.kind === "anniversary"
            ? coupleDisplayName(
                cards.get(o.people[0])?.row,
                cards.get(o.people[1])?.row,
              )
            : nameOf(o.people[0]),
        milestone: isMilestone(o),
      }),
    );
  const week = occasions.filter((o) => o.daysAway < WEEK_DAYS);
  const later = occasions.filter((o) => o.daysAway >= WEEK_DAYS && o.milestone);

  const trees = [...byTree.values()].filter(
    (t) => t.joined.length || t.added.length || t.stories.length || t.photos.length,
  );
  if (!trees.length && !week.length && !later.length) return null;
  return { trees, week, later };
}

/** How many were added across the issue's trees, each placement once,
 *  those who joined included. */
export function addedCount(issue: Issue): number {
  return issue.trees.reduce(
    (n, t) =>
      n + t.joined.length + t.added.reduce((m, g) => m + g.people.length, 0),
    0,
  );
}
