import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { sendEmail } from "@/lib/email";
import { messageWaitingEmail } from "@/lib/emails/message-waiting";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  messageEmailsOneClickHref,
  messageEmailsPageHref,
  messagesHref,
} from "@/lib/tree-links";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tell the other member of a conversation, by email, that a message of the
 * sender's waits for them (Step 182): asked by the sender's device after a
 * message that went to no one else. `claim_waiting_notice`, asked as the
 * sender (`supabase`), decides: someone with no key yet, a message of the
 * sender's waiting for them, not told of this sender already, their emails
 * on, at most three a day to anyone. Then their address is read with the
 * service role, and the email says who wrote, never what. If it couldn't
 * be sent, the record goes, so the next waiting message tries again.
 */
export async function tellWaiting(
  supabase: SupabaseClient<Database>,
  senderId: string,
  conversationId: unknown,
): Promise<{ told: boolean }> {
  if (typeof conversationId !== "string" || !UUID.test(conversationId)) return { told: false };
  const { data: recipient, error } = await supabase.rpc("claim_waiting_notice", {
    p_conversation: conversationId,
  });
  if (error || !recipient) return { told: false };

  const admin = createAdminClient();
  const forget = () =>
    admin
      .from("message_waiting_notices")
      .delete()
      .eq("user_id", recipient)
      .eq("sender_id", senderId);
  const { data: rows, error: readError } = await admin.rpc("waiting_notice_email", {
    p_user: recipient,
    p_sender: senderId,
  });
  const row = rows?.[0];
  if (readError || !row?.email) {
    await forget();
    return { told: false };
  }
  const site = getSiteUrl();
  const email = messageWaitingEmail({
    senderName: row.sender_name,
    url: `${site}${messagesHref(senderId)}`,
    unsubscribe: `${site}${messageEmailsPageHref(row.token)}`,
  });
  const sent = await sendEmail({
    ...email,
    to: row.email,
    headers: {
      "List-Unsubscribe": `<${site}${messageEmailsOneClickHref(row.token)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  if (!sent.ok) {
    console.error("[messages] couldn't send a waiting message's email", sent.error);
    await forget();
    return { told: false };
  }
  return { told: true };
}

/**
 * Those emails' switch by a member's unsubscribe token (Step 182), for the
 * signed-out page and the one-click unsubscribe, as the getting started
 * emails' (`onboarding-settings.server.ts`). The token is the link's only
 * secret, so it's read with the service role and never shown back. `null`
 * for a token that isn't one.
 */
export async function readMessageEmailsByToken(
  token: string,
): Promise<{ subscribed: boolean } | null> {
  if (!UUID.test(token)) return null;
  const { data } = await createAdminClient()
    .from("message_waiting_emails")
    .select("subscribed")
    .eq("token", token)
    .maybeSingle();
  return data ? { subscribed: data.subscribed } : null;
}

/** Turns them off, or back on, by the token; whether the token was one. */
export async function setMessageEmailsByToken(token: string, on: boolean): Promise<boolean> {
  if (!UUID.test(token)) return false;
  const { data, error } = await createAdminClient()
    .from("message_waiting_emails")
    .update({ subscribed: on, updated_at: new Date().toISOString() })
    .eq("token", token)
    .select("user_id");
  if (error) {
    console.error("[messages] couldn't change the waiting emails by link", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}
