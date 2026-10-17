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
 * Whoever was added is named with what they are to the reader, "your
 * first cousin" (Step 144), and each story shared is linked, with who told
 * it and who asked. Once, at the beta reviewers' say, every story so far
 * rather than the week's (`all_stories`).
 *
 * First of all, who has written to them that they haven't read (Step 180):
 * by name and how many, never what they said (the server can't read it).
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
import { relationOf } from "@/lib/connection-path";
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
  /** Picks the word for a relation: "your aunt" over "your aunt or uncle". */
  sex?: string | null;
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
export type IssueName = {
  id: string;
  name: string;
  /** What they are to the reader, where there's an everyday word for it:
   *  "your first cousin" (Step 144). */
  relation?: string;
};

/** A story shared that week, linked to itself (Step 144); never titled. */
export type IssueStory = {
  id: string;
  /** Whom it's about (Step 183): those who said yes whom the reader's
   *  trees show in full. */
  about: IssueName[];
  /** Who told it and who asked, as the story credits them (Step 99). */
  storytellers: IssueName[];
  interviewers: IssueName[];
};

/** A story as the newsletter reads it: whom it's about, and who's credited. */
export type IssueStoryRow = {
  id: string;
  /** Everyone it's about who said yes (Step 183), whom it was first told
   *  about first. */
  about: readonly string[];
  credits: readonly { person_id: string; role: string }[];
};

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
  /** Stories approved that week, oldest first. */
  stories: IssueStory[];
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

/**
 * Someone who has written to the reader since they last read it (Step 180),
 * as `newsletter_unread_messages` counts it: muted conversations and
 * blocked members already left out.
 */
export type IssueUnreadRow = {
  sender_id: string;
  /** Their own entry, if they have one. */
  person_id: string | null;
  /** The name they set, for when the reader's trees don't show them. */
  display_name: string | null;
  unread: number;
  newest_at: string;
  /**
   * Waiting for the reader to visit (Step 182): written before they had a
   * key, `newsletter_waiting_messages`. Read once they visit.
   */
  waiting?: boolean;
};

/** Someone with messages the reader hasn't read (Step 180). */
export type IssueSender = {
  /** Their account: the link opens your conversation with them. */
  userId: string;
  name: string;
  /** What they are to the reader, as `IssueName` says it. */
  relation?: string;
  unread: number;
  /** Waiting for the reader to visit (Step 182). */
  waiting?: boolean;
};

export type Issue = {
  /** Who has written that they haven't read, newest first (Step 180). */
  messages: IssueSender[];
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
  /** Stories approved since `since` (or every one, for a catch-up). */
  stories: readonly IssueStoryRow[];
  /** Album photos approved since `since`, by who's in them. */
  photos: readonly { photo_id: string; person_id: string }[];
  /** Members' names, by user id: their own entry's, else the one they set. */
  memberNames: ReadonlyMap<string, string>;
  /** Members' own entries, by user id: placing one is joining. */
  memberEntries: ReadonlyMap<string, string>;
  /** Who has written that they haven't read (Step 180); none when left out. */
  unread?: readonly IssueUnreadRow[];

  /** The start of the week being told: an ISO timestamp. */
  since: string;
  /** Today, `YYYY-MM-DD`. */
  today: string;
};

/**
 * The reader's newsletter, or null when there's nothing to tell: no entry
 * of their own on their trees to arrange it around, or a quiet week with
 * nothing coming up and no message that came this week. Messages left
 * unread from before name their senders in an issue that goes anyway, but
 * don't send one each week on their own.
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
  // What each one is to the reader (Step 144), in their words: "your
  // first cousin". None where the chain has no everyday name.
  const sexOf = new Map([...cards].map(([id, c]) => [id, { sex: c.row.sex }]));
  const relationTo = (id: string): string | undefined => {
    const r = relationOf(id, input.selfId, sexOf, lines);
    if (!r || !("term" in r)) return undefined;
    return `your ${r.term.charAt(0).toLowerCase()}${r.term.slice(1)}`;
  };
  const named = (id: string): IssueName => {
    const relation = relationTo(id);
    return relation ? { id, name: nameOf(id), relation } : { id, name: nameOf(id) };
  };

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
        tree.joined.push(named(p.person_id));
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
      group.people.push(named(p.person_id));
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
  const treeShowing = (personId: string): IssueTree | undefined => {
    if (!inFamily(personId)) return undefined;
    const treeId = fullTreeOf(personId);
    return treeId ? byTree.get(treeId) : undefined;
  };
  // Credited by name only where the reader's trees name them.
  const credited = (row: IssueStoryRow, role: string): IssueName[] =>
    row.credits.flatMap((c) =>
      c.role === role && cards.has(c.person_id)
        ? [{ id: c.person_id, name: nameOf(c.person_id) }]
        : [],
    );
  for (const row of input.stories) {
    // Under a tree showing the first of them the reader sees in full, once.
    const seen = row.about.filter((id) => treeShowing(id));
    const tree = seen.length > 0 ? treeShowing(seen[0]) : undefined;
    if (!tree || tree.stories.some((s) => s.id === row.id)) continue;
    tree.stories.push({
      id: row.id,
      about: seen.map((id) => ({ id, name: nameOf(id) })),
      storytellers: credited(row, "storyteller"),
      interviewers: credited(row, "interviewer"),
    });
  }
  for (const p of input.photos) {
    const tree = treeShowing(p.person_id);
    if (!tree || tree.photos.some((n) => n.id === p.person_id)) continue;
    tree.photos.push({ id: p.person_id, name: nameOf(p.person_id) });
  }

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

  // Who has written that they haven't read (Step 180), newest first: named
  // as their trees name their entry, with what they are to the reader, or
  // by the name they set where the reader's trees don't show them.
  const unread = [...(input.unread ?? [])]
    .filter((u) => u.unread > 0 && u.sender_id !== input.userId)
    .sort((a, b) => Date.parse(b.newest_at) - Date.parse(a.newest_at));
  const messages = unread.map((u): IssueSender => {
    const shown = u.person_id && cards.has(u.person_id) ? u.person_id : null;
    const name = shown
      ? nameOf(shown)
      : u.display_name?.trim() || "Someone";
    const relation = shown ? relationTo(shown) : undefined;
    return {
      userId: u.sender_id,
      name,
      ...(relation ? { relation } : {}),
      unread: u.unread,
      ...(u.waiting ? { waiting: true } : {}),
    };
  });
  const newMessage = unread.some((u) => Date.parse(u.newest_at) >= since);

  const trees = [...byTree.values()].filter(
    (t) => t.joined.length || t.added.length || t.stories.length || t.photos.length,
  );
  if (!trees.length && !week.length && !later.length && !newMessage) return null;
  return { messages, trees, week, later };
}

/** How many messages are waiting, everyone's together (Step 180). */
export function unreadCount(issue: Issue): number {
  return issue.messages.reduce((n, m) => n + m.unread, 0);
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

/**
 * The hour, in UTC, the cron job calls every day (`vercel.json`: Hobby
 * allows one run a day, so it's fixed there); 15:00 is 8am Pacific in
 * summer. The app sends only on the chosen day.
 */
export const SEND_HOUR_UTC = 15;

/** Days as `newsletter_schedule.weekday` counts them: 0 is Sunday. */
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * When it goes out, as the beta reviewers set it (Step 95), and what the
 * next send carries besides (Step 144): their note at its top, and every
 * story so far rather than the week's. Both clear once it has gone.
 */
export type NewsletterSchedule = {
  weekday: number;
  paused: boolean;
  note: string | null;
  all_stories: boolean;
};

/** Before anyone has changed it: Sundays, not paused, nothing extra. */
export const DEFAULT_SCHEDULE: NewsletterSchedule = {
  weekday: 0,
  paused: false,
  note: null,
  all_stories: false,
};

/** The longest note the newsletter carries. */
export const NOTE_MAX = 2000;

/** Whether the job's call at `now` is the week's send. */
export function isSendDay(
  s: Pick<NewsletterSchedule, "weekday" | "paused">,
  now: Date,
): boolean {
  return !s.paused && now.getUTCDay() === s.weekday;
}

/**
 * When it next goes out: the next chosen day at `SEND_HOUR_UTC`, later
 * than `now` (Hobby runs the job within that hour). Null while paused.
 */
export function nextSendAt(
  s: Pick<NewsletterSchedule, "weekday" | "paused">,
  now: Date,
): Date | null {
  if (s.paused) return null;
  const days = (s.weekday - now.getUTCDay() + 7) % 7;
  const at = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + days,
      SEND_HOUR_UTC,
    ),
  );
  if (at.getTime() <= now.getTime()) at.setUTCDate(at.getUTCDate() + 7);
  return at;
}
