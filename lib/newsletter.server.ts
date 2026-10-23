import "server-only";

import { ROOT } from "@/lib/account-types";
import { openConsoleHref } from "@/lib/admin-queue";
import { sendEmails, unsentSummary, type SendEmailInput } from "@/lib/email";
import { newsletterEmail } from "@/lib/emails/newsletter";
import type { FamilyLine, Showing } from "@/lib/my-family";
import {
  DEFAULT_SCHEDULE,
  isSendDay,
  nextSendAt,
  weeklyIssue,
  type Issue,
  type IssuePlacement,
  type IssueUnreadRow,
  type NewsletterSchedule,
} from "@/lib/newsletter";
import { ensureNewsletterToken } from "@/lib/newsletter-settings.server";
import { reachableEmail } from "@/lib/no-email";
import { personDisplayName } from "@/lib/person-name";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cardOf,
  lineOf,
  readPaged,
  readTreesEdges,
  readTreesPeople,
  type TreeCard,
} from "@/lib/tree";
import {
  inviteRelativeHref,
  messagesHref,
  myFamilyFocusHref,
  myFamilyHref,
  newsletterOneClickHref,
  newsletterPageHref,
  storyHref,
} from "@/lib/tree-links";

/** What a run did, for the cron job's answer and the logs: counts only. */
export type NewsletterRun = {
  /** Members due an issue this week. */
  due: number;
  /** Sent to the mail provider. */
  sent: number;
  /** A quiet week: nothing to tell, so nothing sent. */
  quiet: number;
  /** Marked done by another run first, or turned off meanwhile. */
  skipped: number;
  /** Their email didn't go. */
  unsent: number;
  /** Nothing was due to go: the schedule is paused, or it isn't the day. */
  held?: "paused" | "not today";
};

const NOTHING: NewsletterRun = { due: 0, sent: 0, quiet: 0, skipped: 0, unsent: 0 };

/** When it goes out, as the beta reviewers set it, read with the service role. */
export async function readNewsletterSchedule(): Promise<NewsletterSchedule> {
  const { data, error } = await createAdminClient()
    .from("newsletter_schedule")
    .select("weekday, paused, note, all_stories")
    .maybeSingle();
  if (error) throw new Error(`newsletter_schedule: ${error.message}`);
  return data ?? DEFAULT_SCHEDULE;
}

/**
 * The cron job's daily call (Step 95): the week's send on the day the beta
 * reviewers chose, unless they paused it; nothing on any other day.
 */
export async function sendScheduledNewsletters(
  now: Date = new Date(),
): Promise<NewsletterRun> {
  const schedule = await readNewsletterSchedule();
  if (schedule.paused) return { ...NOTHING, held: "paused" };
  if (!isSendDay(schedule, now)) return { ...NOTHING, held: "not today" };
  const run = await sendWeeklyNewsletters({ now, schedule });
  // The note and the catch-up were for this send only (Step 144).
  if (schedule.note || schedule.all_stories) {
    const { error } = await createAdminClient()
      .from("newsletter_schedule")
      .update({ note: null, all_stories: false })
      .eq("id", true);
    if (error) console.error(`[newsletter] note not cleared — ${error.message}`);
  }
  return run;
}

/**
 * A member's own issue as the next send would make it from what's there
 * now, sent to nobody and marking nothing (the dashboard's preview and its
 * test email): the week before that send, told on that day. Null for a
 * quiet week, or with no entry of their own.
 */
export async function ownNewsletter(
  member: {
    userId: string;
    email: string;
    selfPersonId: string | null;
    /** Their trees, in the order they joined. */
    treeIds: string[];
  },
  /** For an email that goes: its unsubscribe link is theirs (made if
   *  need be). A preview's goes nowhere and writes nothing. */
  { sending = false }: { sending?: boolean } = {},
): Promise<SendEmailInput | null> {
  const now = new Date();
  const schedule = await readNewsletterSchedule();
  const at = nextSendAt(schedule, now) ?? now;
  const token = sending ? await ensureNewsletterToken(member.userId) : "preview";
  const { emails } = await buildWeeklyNewsletters(
    [
      {
        user_id: member.userId,
        email: member.email,
        self_person_id: member.selfPersonId,
        token,
        since: new Date(at.getTime() - 7 * 86_400_000).toISOString(),
        tree_ids: member.treeIds,
      },
    ],
    at,
    schedule,
  );
  return emails.get(member.userId) ?? null;
}

/** Today in UTC, `YYYY-MM-DD`: the job runs on the server's clock. */
function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The weekly newsletter (Step 95): every member due one gets their own,
 * built from the trees they're a member of as they see them there, cut to
 * their own family (`weeklyIssue`). Called by the weekly cron job
 * (`/api/cron/newsletter`); `users` narrows it to some members, for a test
 * send.
 *
 * Every tree anyone due is on is read once, with the service role: the
 * `tree_people` and `tree_edges` views answer it as they answer any member
 * of the tree (a basic card is still only a name). Each member is marked
 * done for the week (`claim_newsletter_issues`) just before the emails go,
 * so a second call that week sends nothing twice, and a run that fails
 * before then leaves them due. A quiet week is marked too, and sends
 * nothing. The emails go in batches (`sendEmails`); the logs keep counts,
 * never an address.
 */
export async function sendWeeklyNewsletters(
  opts: { users?: string[]; now?: Date; schedule?: NewsletterSchedule } = {},
): Promise<NewsletterRun> {
  const supabase = createAdminClient();
  const run: NewsletterRun = { ...NOTHING };
  // A test send carries what the next one will: the note, the catch-up.
  const schedule = opts.schedule ?? (await readNewsletterSchedule());

  const { data: dueRows, error } = await supabase.rpc("newsletter_due", {
    p_users: opts.users,
  });
  if (error) throw new Error(`newsletter_due: ${error.message}`);
  // A member with no email (Step 202) has nothing to be sent to.
  const due = dueRows?.filter((r) => reachableEmail(r.email));
  run.due = due?.length ?? 0;
  if (!due?.length) return run;

  const { emails, quiet, failed } = await buildWeeklyNewsletters(
    due,
    opts.now ?? new Date(),
    schedule,
  );
  run.quiet = quiet;
  run.unsent = failed.size;

  // Done for the week, quiet or not, just before anything goes; one that
  // couldn't be made stays due, for the next call to try again.
  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_newsletter_issues",
    { p_users: due.flatMap((r) => (failed.has(r.user_id) ? [] : [r.user_id])) },
  );
  if (claimError) throw new Error(`claim_newsletter_issues: ${claimError.message}`);
  const ours = new Set(claimed ?? []);
  const toSend = [...emails].filter(([id]) => ours.has(id)).map(([, e]) => e);
  run.skipped = emails.size - toSend.length;

  const results = await sendEmails(toSend);
  run.sent = results.filter((s) => s.ok).length;
  run.unsent += results.length - run.sent;
  const unsent = unsentSummary(results);
  if (unsent) console.error(`[newsletter] ${unsent}`);
  console.info(
    `[newsletter] due ${run.due}, sent ${run.sent}, quiet ${run.quiet}, skipped ${run.skipped}, unsent ${run.unsent}`,
  );
  return run;
}

/** A member due an issue, as `newsletter_due` names them. */
export type NewsletterRecipient = {
  user_id: string;
  email: string;
  self_person_id: string | null;
  token: string;
  since: string;
  tree_ids: string[];
};

/**
 * Each recipient's email, by user id, without sending anything or marking
 * anyone done: what `sendWeeklyNewsletters` sends, and what a preview
 * shows. `quiet` counts those with nothing to tell (or no entry of their
 * own to cut it to); `failed`, those whose issue couldn't be made, logged
 * and never sent half-made.
 */
export async function buildWeeklyNewsletters(
  due: readonly NewsletterRecipient[],
  now: Date,
  /** What the send carries besides (Step 144): the note, every story. */
  { note, all_stories: allStories }: Pick<NewsletterSchedule, "note" | "all_stories"> = DEFAULT_SCHEDULE,
): Promise<{
  emails: Map<string, SendEmailInput>;
  quiet: number;
  failed: Set<string>;
}> {
  // Who has written to each that they haven't read (Step 180): only the
  // newsletter tells it, not the getting started win-back.
  const { data: unread, error } = await createAdminClient().rpc(
    "newsletter_unread_messages",
    { p_users: due.map((r) => r.user_id) },
  );
  if (error) throw new Error(`newsletter_unread_messages: ${error.message}`);
  // And whose messages wait for a member who hasn't visited since messages
  // began (Step 182): the same section says so.
  const { data: waiting, error: waitingError } = await createAdminClient().rpc(
    "newsletter_waiting_messages",
    { p_users: due.map((r) => r.user_id) },
  );
  if (waitingError) throw new Error(`newsletter_waiting_messages: ${waitingError.message}`);
  const unreadBy = new Map<string, UnreadSender[]>();
  for (const u of [...(unread ?? []), ...(waiting ?? []).map((w) => ({ ...w, waiting: true }))]) {
    const list = unreadBy.get(u.user_id) ?? [];
    list.push(u);
    unreadBy.set(u.user_id, list);
  }
  const { issues, failed } = await buildFamilyIssues(
    due.map((r) => ({ ...r, unread: unreadBy.get(r.user_id) ?? [] })),
    now,
    { allStories },
  );
  const site = getSiteUrl();
  const emails = new Map<string, SendEmailInput>();
  let quiet = 0;
  for (const r of due) {
    if (failed.has(r.user_id)) continue;
    const made = issues.get(r.user_id);
    if (!made?.issue) {
      quiet++;
      continue;
    }
    try {
      const page = `${site}${newsletterPageHref(r.token)}`;
      emails.set(r.user_id, {
        to: r.email,
        ...newsletterEmail({
          issue: made.issue,
          personUrl: (id) => `${site}${myFamilyFocusHref(id)}`,
          familyUrl: `${site}${myFamilyHref()}`,
          unsubscribeUrl: page,
          inviteUrl: `${site}${made.invite}`,
          storyUrl: (id) => `${site}${storyHref(id)}`,
          messagesUrl: (userId) => `${site}${messagesHref(userId)}`,
          note,
        }),
        headers: {
          "List-Unsubscribe": `<${site}${newsletterOneClickHref(r.token)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
    } catch (err) {
      failed.add(r.user_id);
      console.error("[newsletter] couldn't make one issue", err);
    }
  }
  return { emails, quiet, failed };
}

/** Someone who has written to a reader that they haven't read (Step 180),
 *  as `newsletter_unread_messages` counts it. */
export type UnreadSender = Omit<IssueUnreadRow, "person_id" | "display_name">;

/** A member to tell what changed in their family since `since`. */
export type IssueReader = Pick<
  NewsletterRecipient,
  "user_id" | "self_person_id" | "since" | "tree_ids"
> & {
  /** Who has written that they haven't read (Step 180): the newsletter's. */
  unread?: readonly UnreadSender[];
};

/** One reader's issue, and where they invite family from. */
export type FamilyIssue = {
  /** Null for a quiet stretch, or with no entry of their own. */
  issue: Issue | null;
  /** A Root invites from the console of the first tree they run; anyone
   *  else, from settings, into the first tree they joined (Step 143). */
  invite: string;
};

/**
 * What changed in each reader's family since their own `since`
 * (`weeklyIssue`): the weekly newsletter's issue, and the getting started
 * win-back's "since you were last here" (Step 151). Every tree anyone
 * reads is read once, with the service role: the `tree_people` and
 * `tree_edges` views answer it as they answer any member of the tree (a
 * basic card is still only a name). One that can't be made is logged and
 * named in `failed`, never told half-made.
 */
export async function buildFamilyIssues(
  readers: readonly IssueReader[],
  now: Date,
  /** Every story so far rather than the stretch's (Step 144). */
  { allStories = false }: { allStories?: boolean } = {},
): Promise<{ issues: Map<string, FamilyIssue>; failed: Set<string> }> {
  const supabase = createAdminClient();
  const treeIds = [...new Set(readers.flatMap((r) => r.tree_ids ?? []))];
  const earliest = new Date(
    Math.min(...readers.map((r) => Date.parse(r.since))),
  ).toISOString();
  const [trees, people, edges, placements, yeses, tags, roles] = await Promise.all([
    supabase.from("trees").select("id, name").in("id", treeIds),
    readTreesPeople(supabase, treeIds),
    readTreesEdges(supabase, treeIds),
    readPaged((from, to) =>
      supabase
        .from("tree_placements")
        .select("tree_id, person_id, placed_by, created_at")
        .in("tree_id", treeIds)
        .eq("status", "active")
        .order("id")
        .range(from, to),
    ),
    // Each yes to being in a story since the earliest week told, given
    // then, or when it was told if it needed none (Step 183: a story is on
    // the details of everyone it's about who said yes). Every one, for a
    // catch-up (Step 144).
    readPaged((from, to) => {
      const q = supabase
        .from("story_subjects")
        .select("story_id, person_id, decided_at, created_at")
        .eq("status", "approved");
      return (
        allStories
          ? q
          : q.or(`decided_at.gte."${earliest}",and(decided_at.is.null,created_at.gte."${earliest}")`)
      )
        .order("story_id")
        .order("person_id")
        .range(from, to);
    }),
    readPaged((from, to) =>
      supabase
        .from("album_tags")
        .select("photo_id, person_id, decided_at, created_at")
        .eq("status", "approved")
        .or(`decided_at.gte."${earliest}",and(decided_at.is.null,created_at.gte."${earliest}")`)
        .order("photo_id")
        .order("person_id")
        .range(from, to),
    ),
    // Which of their trees each one runs: a Root invites from its console
    // (Step 143).
    supabase
      .from("tree_members")
      .select("tree_id, user_id")
      .eq("role", ROOT.key)
      .in("tree_id", treeIds)
      .in("user_id", readers.map((r) => r.user_id)),
  ]);
  if (
    roles.error ||
    trees.error ||
    people.failed ||
    edges.failed ||
    placements.failed ||
    yeses.failed ||
    tags.failed
  ) {
    throw new Error("Couldn't read the trees for the newsletter.");
  }

  // Those stories, oldest first, with everyone they're about who said yes,
  // whom each was first told about first, and who's credited.
  const yesesOf = new Map<string, typeof yeses.rows>();
  for (const y of yeses.rows) yesesOf.set(y.story_id, [...(yesesOf.get(y.story_id) ?? []), y]);
  const storyIds = [...yesesOf.keys()];
  const told = storyIds.length
    ? await readPaged((from, to) =>
        supabase
          .from("stories")
          .select("id, person_id, story_credits(person_id, role), story_subjects(person_id, status)")
          .in("id", storyIds)
          .order("created_at")
          .order("id")
          .range(from, to),
      )
    : { rows: [], failed: false };
  if (told.failed) throw new Error("Couldn't read the stories for the newsletter.");
  const stories = told.rows.map((s) => ({
    id: s.id,
    about: (s.story_subjects ?? [])
      .filter((a) => a.status === "approved")
      .map((a) => a.person_id)
      .sort((a, b) => Number(b === s.person_id) - Number(a === s.person_id)),
    credits: s.story_credits ?? [],
  }));

  // Whoever placed a card, by the name the family knows them by: their own
  // entry's, else the one they set (often still their address's first
  // half, as it starts). And whoever wrote to a reader (Step 180).
  const placers = new Set(
    placements.rows.flatMap((p) => (p.placed_by ? [p.placed_by] : [])),
  );
  const senders = new Set(
    readers.flatMap((r) => (r.unread ?? []).map((u) => u.sender_id)),
  );
  const members = [...new Set([...placers, ...senders])];
  const { data: memberRows, error: memberError } = members.length
    ? await supabase
        .from("profiles")
        .select("auth_user_id, display_name, self_person_id")
        .in("auth_user_id", members)
    : { data: [], error: null };
  if (memberError) throw new Error(`profiles: ${memberError.message}`);

  const showingsByTree = new Map<string, Showing<TreeCard>[]>();
  const placedAt = new Map(
    placements.rows.map((p) => [`${p.tree_id}:${p.person_id}`, p.created_at]),
  );
  const nameOfPerson = new Map<string, string>();
  for (const p of people.rows) {
    const card = p.tree_id ? cardOf(p, p.tree_id) : null;
    // A placeholder child (Step 98.2) is no news: nothing to tell yet.
    if (!p.tree_id || !card || card.blurred || card.placeholder_number != null)
      continue;
    nameOfPerson.set(card.id, personDisplayName(card));
    const list = showingsByTree.get(p.tree_id) ?? [];
    list.push({
      treeId: p.tree_id,
      row: card,
      basic: card.basic,
      isHome: card.is_home,
      placedAt: placedAt.get(`${p.tree_id}:${card.id}`) ?? null,
    });
    showingsByTree.set(p.tree_id, list);
  }
  const linesByTree = new Map<string, FamilyLine[]>();
  for (const r of edges.rows) {
    const line = r.tree_id ? lineOf(r, r.tree_id) : null;
    if (!r.tree_id || !line) continue;
    const list = linesByTree.get(r.tree_id) ?? [];
    list.push({ ...line, drawn_on_tree_id: r.drawn_on_tree_id });
    linesByTree.set(r.tree_id, list);
  }
  const memberNames = new Map<string, string>();
  const memberEntries = new Map<string, string>();
  const profileOf = new Map((memberRows ?? []).map((m) => [m.auth_user_id, m]));
  for (const m of memberRows ?? []) {
    if (!placers.has(m.auth_user_id)) continue;
    const name =
      (m.self_person_id ? nameOfPerson.get(m.self_person_id) : undefined) ||
      m.display_name?.trim();
    if (name) memberNames.set(m.auth_user_id, name);
    if (m.self_person_id) memberEntries.set(m.auth_user_id, m.self_person_id);
  }
  const treeName = new Map((trees.data ?? []).map((t) => [t.id, t.name]));
  const runs = new Set((roles.data ?? []).map((m) => `${m.user_id}:${m.tree_id}`));
  const placementRows: IssuePlacement[] = placements.rows;
  const today = utcDay(now);

  // Each reader's own issue; one that can't be made is logged and left
  // out, never told half-made.
  const issues = new Map<string, FamilyIssue>();
  const failed = new Set<string>();
  for (const r of readers) {
    try {
      const theirTrees = (r.tree_ids ?? []).flatMap((id) => {
        const name = treeName.get(id);
        return name ? [{ id, name }] : [];
      });
      const ran = theirTrees.find((t) => runs.has(`${r.user_id}:${t.id}`));
      const invite = ran
        ? openConsoleHref("invite-to-claim", ran.id)
        : inviteRelativeHref(theirTrees[0]?.id ?? "");
      const issue = r.self_person_id
        ? weeklyIssue({
            userId: r.user_id,
            selfId: r.self_person_id,
            trees: theirTrees,
            showings: theirTrees.flatMap((t) => showingsByTree.get(t.id) ?? []),
            lines: theirTrees.flatMap((t) => linesByTree.get(t.id) ?? []),
            placements: placementRows,
            stories: stories.filter(
              (s) =>
                allStories || (yesesOf.get(s.id) ?? []).some((y) => withinWeek(y, r.since)),
            ),
            photos: tags.rows.filter((t) => withinWeek(t, r.since)),
            memberNames,
            memberEntries,
            // Named on their trees by their entry where they show it, else by
            // the name they set (`weeklyIssue`).
            unread: (r.unread ?? []).map((u) => ({
              ...u,
              person_id: profileOf.get(u.sender_id)?.self_person_id ?? null,
              display_name: profileOf.get(u.sender_id)?.display_name ?? null,
            })),
            since: r.since,
            today,
          })
        : null;
      issues.set(r.user_id, { issue, invite });
    } catch (err) {
      failed.add(r.user_id);
      console.error("[newsletter] couldn't make one issue", err);
    }
  }
  return { issues, failed };
}

/** Approved within the member's own week: when its yes came, or it was made. */
function withinWeek(
  row: { decided_at: string | null; created_at: string },
  since: string,
): boolean {
  return Date.parse(row.decided_at ?? row.created_at) >= Date.parse(since);
}
