import "server-only";

import { sendEmails, unsentSummary } from "@/lib/email";
import { placementAskedEmail } from "@/lib/emails/placement-asked";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { asksHref } from "@/lib/tree-links";

/**
 * Emailing whoever's yes a card waits on, the moment it's brought over
 * (Step 80). Runs after the Root has their answer (`after()` in
 * `placePeople`), so nothing here can slow that down or fail it: every
 * problem is logged and swallowed, and the ask waits on their account
 * either way. Addresses come from the service role
 * (`placement_ask_recipients`) and never reach a browser. Nobody is asked
 * twice about the same card, so there is nothing to cap: a tree can send
 * each person one email about their own entry, and one for each batch of
 * entries they may edit. They go together in one request (Step 77.5), and
 * the logs keep how the mail provider answered, never its words.
 */
export async function alertPlacementAsks(asked: {
  treeId: string;
  treeName: string;
  placerName: string;
  /** Those `place_people` asked about in this call (`newly_asked`). */
  personIds: string[];
}): Promise<void> {
  if (asked.personIds.length === 0) return;
  const what = `asks to show ${asked.personIds.length} on tree ${asked.treeId}`;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("placement_ask_recipients", {
      p_tree: asked.treeId,
      p_person_ids: asked.personIds,
    });
    if (error) throw error;

    const url = `${getSiteUrl()}${asksHref()}`;
    const to = (data ?? []).filter((r) => r.email);
    const sent = await sendEmails(
      to.map((r) => ({
        to: r.email,
        ...placementAskedEmail({
          kind: r.kind === "owner" ? "owner" : "steward",
          placerName: asked.placerName,
          treeName: asked.treeName,
          homeTreeName: r.home_tree_name,
          entries: r.entries,
          personName: r.person_name,
          url,
        }),
      })),
    );
    const unsent = unsentSummary(sent);
    if (unsent) console.error(`[placement-alerts] ${what}: ${unsent}`);
    else console.info(`[placement-alerts] ${what}: emailed ${to.length}`);
  } catch (err) {
    console.error(`[placement-alerts] ${what}: couldn't email who was asked`, err);
  }
}

/**
 * What a tree's waiting asks have to send (Step 83): the one reminder, a
 * week after an ask, and word to the Root who asked when it lapses after 30
 * days. There is no scheduler, so the tree's own page sets this off, after
 * it has answered (`after()`), when `tree_people.nudge_due` says something
 * is owed. `run_placement_nudges` hands each out once, however many pages
 * ask at once: it writes the notice of a lapse itself, and what comes back
 * is who to email a reminder. Logged and swallowed, as above.
 */
export async function sendPlacementNudges(treeId: string): Promise<void> {
  const what = `reminders on tree ${treeId}`;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("run_placement_nudges", {
      p_tree: treeId,
    });
    if (error) throw error;

    const to = (data ?? []).filter((r) => r.email);
    if (to.length === 0) return;
    const url = `${getSiteUrl()}${asksHref()}`;
    const sent = await sendEmails(
      to.map((r) => ({
        to: r.email,
        ...placementAskedEmail({
          kind: r.kind === "owner" ? "owner" : "steward",
          placerName: r.placer_name,
          treeName: r.tree_name,
          homeTreeName: r.home_tree_name,
          entries: r.entries,
          personName: r.person_name,
          url,
          reminder: true,
        }),
      })),
    );
    const unsent = unsentSummary(sent);
    if (unsent) console.error(`[placement-alerts] ${what}: ${unsent}`);
    else console.info(`[placement-alerts] ${what}: emailed ${to.length}`);
  } catch (err) {
    console.error(`[placement-alerts] ${what}: couldn't send them`, err);
  }
}
