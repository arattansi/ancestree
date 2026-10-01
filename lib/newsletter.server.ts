import "server-only";

import { sendEmails, unsentSummary, type SendEmailInput } from "@/lib/email";
import { newsletterEmail } from "@/lib/emails/newsletter";
import type { FamilyLine, Showing } from "@/lib/my-family";
import { weeklyIssue, type IssuePlacement } from "@/lib/newsletter";
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
  myFamilyFocusHref,
  myFamilyHref,
  newsletterOneClickHref,
  newsletterPageHref,
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
};

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
  opts: { users?: string[]; now?: Date } = {},
): Promise<NewsletterRun> {
  const supabase = createAdminClient();
  const run: NewsletterRun = { due: 0, sent: 0, quiet: 0, skipped: 0, unsent: 0 };

  const { data: due, error } = await supabase.rpc("newsletter_due", {
    p_users: opts.users,
  });
  if (error) throw new Error(`newsletter_due: ${error.message}`);
  run.due = due?.length ?? 0;
  if (!due?.length) return run;

  const { emails, quiet, failed } = await buildWeeklyNewsletters(
    due,
    opts.now ?? new Date(),
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
): Promise<{
  emails: Map<string, SendEmailInput>;
  quiet: number;
  failed: Set<string>;
}> {
  const supabase = createAdminClient();
  const treeIds = [...new Set(due.flatMap((r) => r.tree_ids ?? []))];
  const earliest = new Date(
    Math.min(...due.map((r) => Date.parse(r.since))),
  ).toISOString();

  const [trees, people, edges, placements, stories, tags] = await Promise.all([
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
    // Approved since the earliest week told: a story when its yes was
    // given, or when it was told if it needed none.
    readPaged((from, to) =>
      supabase
        .from("stories")
        .select("person_id, decided_at, created_at")
        .eq("status", "approved")
        .or(`decided_at.gte."${earliest}",and(decided_at.is.null,created_at.gte."${earliest}")`)
        .order("id")
        .range(from, to),
    ),
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
  ]);
  if (
    trees.error ||
    people.failed ||
    edges.failed ||
    placements.failed ||
    stories.failed ||
    tags.failed
  ) {
    throw new Error("Couldn't read the trees for the newsletter.");
  }

  // Whoever placed a card, by the name the family knows them by: their own
  // entry's, else the one they set (often still their address's first
  // half, as it starts).
  const placers = [
    ...new Set(placements.rows.flatMap((p) => (p.placed_by ? [p.placed_by] : []))),
  ];
  const { data: placerRows, error: placerError } = placers.length
    ? await supabase
        .from("profiles")
        .select("auth_user_id, display_name, self_person_id")
        .in("auth_user_id", placers)
    : { data: [], error: null };
  if (placerError) throw new Error(`profiles: ${placerError.message}`);

  const showingsByTree = new Map<string, Showing<TreeCard>[]>();
  const placedAt = new Map(
    placements.rows.map((p) => [`${p.tree_id}:${p.person_id}`, p.created_at]),
  );
  const nameOfPerson = new Map<string, string>();
  for (const p of people.rows) {
    const card = p.tree_id ? cardOf(p, p.tree_id) : null;
    if (!p.tree_id || !card || card.blurred) continue;
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
  for (const m of placerRows ?? []) {
    const name =
      (m.self_person_id ? nameOfPerson.get(m.self_person_id) : undefined) ||
      m.display_name?.trim();
    if (name) memberNames.set(m.auth_user_id, name);
    if (m.self_person_id) memberEntries.set(m.auth_user_id, m.self_person_id);
  }
  const treeName = new Map((trees.data ?? []).map((t) => [t.id, t.name]));
  const placementRows: IssuePlacement[] = placements.rows;
  const today = utcDay(now);
  const site = getSiteUrl();

  // Each member's own issue; one that can't be made is logged and left
  // out, never sent half-made.
  const emails = new Map<string, SendEmailInput>();
  const failed = new Set<string>();
  let quiet = 0;
  for (const r of due) {
    if (!r.self_person_id) {
      quiet++;
      continue;
    }
    try {
      const theirTrees = (r.tree_ids ?? []).flatMap((id) => {
        const name = treeName.get(id);
        return name ? [{ id, name }] : [];
      });
      const issue = weeklyIssue({
        userId: r.user_id,
        selfId: r.self_person_id,
        trees: theirTrees,
        showings: theirTrees.flatMap((t) => showingsByTree.get(t.id) ?? []),
        lines: theirTrees.flatMap((t) => linesByTree.get(t.id) ?? []),
        placements: placementRows,
        stories: stories.rows.filter((s) => withinWeek(s, r.since)),
        photos: tags.rows.filter((t) => withinWeek(t, r.since)),
        memberNames,
        memberEntries,
        since: r.since,
        today,
      });
      if (!issue) {
        quiet++;
        continue;
      }
      const page = `${site}${newsletterPageHref(r.token)}`;
      emails.set(r.user_id, {
        to: r.email,
        ...newsletterEmail({
          issue,
          personUrl: (id) => `${site}${myFamilyFocusHref(id)}`,
          familyUrl: `${site}${myFamilyHref()}`,
          unsubscribeUrl: page,
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

/** Approved within the member's own week: when its yes came, or it was made. */
function withinWeek(
  row: { decided_at: string | null; created_at: string },
  since: string,
): boolean {
  return Date.parse(row.decided_at ?? row.created_at) >= Date.parse(since);
}
