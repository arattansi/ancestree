import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The weekly newsletter's switch by a member's unsubscribe token (Step 95),
 * for the signed-out page and the one-click unsubscribe. The token is the
 * link's only secret, so it's read with the service role and never shown
 * back: the page says only whether it's on. `null` for a token that isn't
 * one (mistyped, or the account has gone).
 */
export async function readNewsletterByToken(
  token: string,
): Promise<{ subscribed: boolean } | null> {
  if (!UUID.test(token)) return null;
  const { data } = await createAdminClient()
    .from("newsletter_settings")
    .select("subscribed")
    .eq("token", token)
    .maybeSingle();
  return data ? { subscribed: data.subscribed } : null;
}

/** Turns it off, or back on, by the token; whether the token was one. */
export async function setNewsletterByToken(
  token: string,
  on: boolean,
): Promise<boolean> {
  if (!UUID.test(token)) return false;
  const { data, error } = await createAdminClient()
    .from("newsletter_settings")
    .update({ subscribed: on, updated_at: new Date().toISOString() })
    .eq("token", token)
    .select("user_id");
  if (error) {
    console.error("[newsletter] couldn't change it by link", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}
