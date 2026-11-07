import "server-only";

import type { OpensState } from "@/lib/newsletter-opens";
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
): Promise<{ subscribed: boolean; countOpens: boolean } | null> {
  if (!UUID.test(token)) return null;
  const { data } = await createAdminClient()
    .from("newsletter_settings")
    .select("subscribed, count_opens")
    .eq("token", token)
    .maybeSingle();
  return data ? { subscribed: data.subscribed, countOpens: data.count_opens } : null;
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

/**
 * Turns counting when they open the newsletter on, or off, by the token
 * (Step 226), for the signed-out page. When it was and where is kept as the
 * proof that they said yes (CNIL §6). Whether the token was one.
 */
export async function setOpensByToken(token: string, on: boolean): Promise<boolean> {
  if (!UUID.test(token)) return false;
  const now = new Date().toISOString();
  const { data, error } = await createAdminClient()
    .from("newsletter_settings")
    .update({ count_opens: on, count_opens_at: now, count_opens_via: "page", updated_at: now })
    .eq("token", token)
    .select("user_id");
  if (error) {
    console.error("[newsletter] couldn't change counting opens by link", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

/** Ids per read: a list in the address stays short. */
const READ_CHUNK = 100;

/**
 * What each of `userIds` has said on counting opens (Step 226), for the issue
 * being made: whether to count theirs, and whether to ask. A member with no
 * row has said nothing.
 */
export async function readOpensStates(
  userIds: readonly string[],
): Promise<Map<string, OpensState>> {
  const states = new Map<string, OpensState>();
  const admin = createAdminClient();
  for (let i = 0; i < userIds.length; i += READ_CHUNK) {
    const { data, error } = await admin
      .from("newsletter_settings")
      .select("user_id, count_opens, opens_asked_at")
      .in("user_id", userIds.slice(i, i + READ_CHUNK));
    if (error) throw new Error(`newsletter_settings: ${error.message}`);
    for (const row of data ?? []) {
      states.set(row.user_id, {
        count_opens: row.count_opens,
        opens_asked_at: row.opens_asked_at,
      });
    }
  }
  return states;
}

/**
 * Notes that the newsletter has asked these members to count their opens
 * (Step 226), so it doesn't ask again for six months. A failure is logged.
 */
export async function noteOpensAsked(userIds: readonly string[]): Promise<void> {
  if (userIds.length === 0) return;
  const { error } = await createAdminClient()
    .from("newsletter_settings")
    .update({ opens_asked_at: new Date().toISOString() })
    .in("user_id", [...userIds]);
  if (error) console.error("[newsletter] couldn't note who was asked", error.message);
}

/**
 * A member's unsubscribe token, made now if they have no row yet (on, as
 * every member starts), for an email built outside the weekly run: the
 * dashboard's test email.
 */
export async function ensureNewsletterToken(userId: string): Promise<string> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("newsletter_settings")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) throw new Error(`newsletter_settings: ${error.message}`);
  const { data, error: readError } = await admin
    .from("newsletter_settings")
    .select("token")
    .eq("user_id", userId)
    .single();
  if (readError) throw new Error(`newsletter_settings: ${readError.message}`);
  return data.token;
}
