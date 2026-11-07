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
