import "server-only";

import {
  readNewsletterEngagement,
  type NewsletterEngagement,
} from "@/lib/newsletter-engagement";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isBetaReviewer } from "@/lib/tree-requests.server";

/**
 * An issue went out, or is about to: `sent` more of them on `day` (Step
 * 225). The weekly job calls it with none before the first batch goes and
 * again with how many did. A failure is logged and never stops the send.
 */
export async function noteNewsletterIssue(day: string, sent: number): Promise<void> {
  const { error } = await createAdminClient().rpc("record_newsletter_issue", {
    p_day: day,
    p_sent: sent,
  });
  if (error) console.error(`[newsletter] issue not recorded — ${error.message}`);
}

/**
 * The keys of the pixels in an issue's copies, noted as it goes out (Step
 * 226). The keys belong to no member. A failure is logged and the copies go
 * without a pixel's worth of count.
 */
export async function noteNewsletterPixels(day: string, keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  const { error } = await createAdminClient().rpc("record_newsletter_pixels", {
    p_day: day,
    p_keys: [...keys],
  });
  if (error) console.error(`[newsletter] pixels not recorded — ${error.message}`);
}

/** A copy's pixel was loaded (Step 226); a failure is logged and shown to nobody. */
export async function noteNewsletterOpen(key: string): Promise<void> {
  const { error } = await createAdminClient().rpc("note_newsletter_open", { p_key: key });
  if (error) console.error(`[newsletter] open not noted — ${error.message}`);
}

/**
 * The analytics tab's newsletter (Step 225) for a beta reviewer; null for
 * anyone else, whom `newsletter_engagement()` refuses anyway, and when it
 * can't be read.
 */
export async function loadNewsletterEngagement(): Promise<NewsletterEngagement | null> {
  if (!(await isBetaReviewer())) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("newsletter_engagement");
  if (error) return null;
  return readNewsletterEngagement(data);
}
