import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The getting started emails' switch by a member's unsubscribe token (Step
 * 151), for the signed-out page and the one-click unsubscribe, as the
 * newsletter's (`newsletter-settings.server.ts`). The token is the link's
 * only secret, so it's read with the service role and never shown back.
 * `null` for a token that isn't one.
 */
export async function readGettingStartedByToken(
  token: string,
): Promise<{ subscribed: boolean } | null> {
  if (!UUID.test(token)) return null;
  const { data } = await createAdminClient()
    .from("onboarding_settings")
    .select("subscribed")
    .eq("token", token)
    .maybeSingle();
  return data ? { subscribed: data.subscribed } : null;
}

/** Turns them off, or back on, by the token; whether the token was one. */
export async function setGettingStartedByToken(
  token: string,
  on: boolean,
): Promise<boolean> {
  if (!UUID.test(token)) return false;
  const { data, error } = await createAdminClient()
    .from("onboarding_settings")
    .update({ subscribed: on, updated_at: new Date().toISOString() })
    .eq("token", token)
    .select("user_id");
  if (error) {
    console.error("[onboarding] couldn't change it by link", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}
