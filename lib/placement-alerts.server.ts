import "server-only";

import { sendEmail } from "@/lib/email";
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
 * entries they may edit.
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
    let failed = 0;
    let lastError = "";
    // One at a time: the mail provider limits how fast a team may send.
    for (const to of data ?? []) {
      if (!to.email) continue;
      const sent = await sendEmail({
        to: to.email,
        ...placementAskedEmail({
          kind: to.kind === "owner" ? "owner" : "steward",
          placerName: asked.placerName,
          treeName: asked.treeName,
          homeTreeName: to.home_tree_name,
          entries: to.entries,
          personName: to.person_name,
          url,
        }),
      });
      if (!sent.ok) {
        failed += 1;
        lastError = sent.error;
      }
    }
    const total = (data ?? []).length;
    if (failed > 0) {
      console.error(
        `[placement-alerts] ${what}: ${failed} of ${total} emails failed to send — ${lastError}`,
      );
    } else {
      console.info(`[placement-alerts] ${what}: emailed ${total}`);
    }
  } catch (err) {
    console.error(`[placement-alerts] ${what}: couldn't email who was asked`, err);
  }
}
