import "server-only";

import { sendEmails, type SendEmailResult } from "@/lib/email";
import { cardLastCallEmail } from "@/lib/emails/card-last-call";
import { reachableEmail } from "@/lib/no-email";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cardEmailsOneClickHref,
  cardEmailsPageHref,
  myFamilyFocusHref,
} from "@/lib/tree-links";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "last chance to sign Ada’s birthday card!" (Step 232), from the birthday
 * cards' cron: `claim_card_last_calls` records and answers the emails due
 * now (a week before a card opens, from 8 in each member's morning, once a
 * card and member, to those reminded to sign it who haven't), and they go
 * in batches, each with its own unsubscribe link. One Resend turned down
 * for a reason that may pass is taken off the record, so the next run tries
 * again; one that may have gone, or to an address Resend refused, isn't.
 * A failure is logged only: it never stops the rest of the run.
 */
export async function sendCardLastCalls(): Promise<{ emailed: number }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("claim_card_last_calls");
    if (error) throw error;
    const site = getSiteUrl();
    const due = (data ?? []).flatMap((r) => {
      const to = reachableEmail(r.email);
      if (!to) return [];
      const email = cardLastCallEmail({
        firstName: r.first_name ?? "",
        opensOn: r.opens_on,
        daysAway: r.days_away,
        signatures: r.signatures,
        url: `${site}${myFamilyFocusHref(r.person_id)}`,
        unsubscribe: `${site}${cardEmailsPageHref(r.token)}`,
      });
      return [
        {
          row: r,
          email: {
            ...email,
            to,
            headers: {
              "List-Unsubscribe": `<${site}${cardEmailsOneClickHref(r.token)}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          },
        },
      ];
    });
    const sent = await sendEmails(due.map((d) => d.email));

    const again = due.filter((_, i) => mayTryAgain(sent[i]));
    for (const { row } of again) {
      const { error: forgetError } = await admin
        .from("card_last_calls")
        .delete()
        .eq("card_id", row.card_id)
        .eq("user_id", row.user_id);
      if (forgetError) console.error("[cards] couldn't free a last call to send again", forgetError);
    }
    if (again.length > 0) console.error(`[cards] ${again.length} last-call emails wait for the next run`);
    return { emailed: sent.filter((s) => s.ok).length };
  } catch (error) {
    console.error("[cards] couldn't send the last-call emails", error);
    return { emailed: 0 };
  }
}

/**
 * Whether a send that didn't go may go next time: Resend answered and said
 * no for a reason other than the address (a 429 after its wait, a 5xx). One
 * it never answered may have gone, and twice is worse than not at all.
 */
export function mayTryAgain(result: SendEmailResult | undefined): boolean {
  return !!result && !result.ok && result.status !== undefined && result.status !== 422;
}

/**
 * Those emails' switch by a member's unsubscribe token, for the signed-out
 * page and the one-click unsubscribe, as the message emails'
 * (`message-waiting.server.ts`). The token is the link's only secret, so
 * it's read with the service role and never shown back. `null` for a token
 * that isn't one.
 */
export async function readCardEmailsByToken(
  token: string,
): Promise<{ subscribed: boolean } | null> {
  if (!UUID.test(token)) return null;
  const { data } = await createAdminClient()
    .from("card_sign_emails")
    .select("subscribed")
    .eq("token", token)
    .maybeSingle();
  return data ? { subscribed: data.subscribed } : null;
}

/** Turns them off, or back on, by the token; whether the token was one. */
export async function setCardEmailsByToken(token: string, on: boolean): Promise<boolean> {
  if (!UUID.test(token)) return false;
  const { data, error } = await createAdminClient()
    .from("card_sign_emails")
    .update({ subscribed: on, updated_at: new Date().toISOString() })
    .eq("token", token)
    .select("user_id");
  if (error) {
    console.error("[cards] couldn't change the card emails by link", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}
