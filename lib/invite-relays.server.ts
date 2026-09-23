import "server-only";

import { sendEmail } from "@/lib/email";
import { inviteRelayedEmail } from "@/lib/emails/invite-relayed";
import {
  RELAY_CAPS,
  RELAY_SPAN_MS,
  relayHref,
  relayWithinCaps,
} from "@/lib/invite-relays";
import type { NameAndEmail } from "@/lib/request-forms";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

export type RelayAsk = NameAndEmail & {
  /** The relative's address, trimmed and lower-cased. */
  relativeEmail: string;
};

/** A database error, without the row it was about: nothing typed reaches a log. */
function logged(error: { code?: string; message?: string }): string {
  return `${error.code ?? "?"} ${error.message ?? ""}`.trim();
}

/**
 * Pass a newcomer's ask on to the relative whose address they gave (Step
 * 30.5): if it belongs to a member, file it (`invite_relays`) and email
 * them, with a button to the invite filled in on their account page. Runs
 * after the newcomer has their answer (`after()` in `askRelative`), so
 * nothing here can change what they're told or how long it takes. Every
 * outcome is silent: nobody by that address, asked already (open or
 * dismissed), past a cap, or a failure — each is logged without a name or
 * an address, and swallowed.
 *
 * The ask is filed before the caps are counted and taken back if it's over
 * one, so two at once can't both slip under.
 */
export async function passOnRelay(ask: RelayAsk): Promise<void> {
  const what = "[invite-relays] ask to a relative";
  try {
    const supabase = createAdminClient();

    const { data: found, error: lookupError } = await supabase.rpc(
      "invite_relay_recipient",
      { p_email: ask.relativeEmail },
    );
    if (lookupError) throw new Error(logged(lookupError));
    const recipient = found?.[0];
    // Nobody by that address: nothing to keep, and nobody to tell.
    if (!recipient?.user_id || !recipient.email) return;

    const { data: filed, error: fileError } = await supabase
      .from("invite_relays")
      .insert({
        recipient_user_id: recipient.user_id,
        first_name: ask.firstName,
        last_name: ask.lastName,
        email: ask.email,
      })
      .select("id")
      .single();
    if (fileError) {
      // Asked already — open, or dismissed by the member: nobody is emailed.
      if (fileError.code === "23505") return;
      throw new Error(logged(fileError));
    }

    const now = Date.now();
    const since = (ms: number) => new Date(now - ms).toISOString();
    const [fromRequester, toRecipient, overall] = await Promise.all([
      supabase
        .from("invite_relays")
        .select("created_at")
        .eq("email", ask.email)
        .gte("created_at", since(RELAY_SPAN_MS.day))
        .order("created_at", { ascending: false })
        .limit(RELAY_CAPS.perRequester.perDay + 1),
      supabase
        .from("invite_relays")
        .select("created_at")
        .eq("recipient_user_id", recipient.user_id)
        .gte("created_at", since(RELAY_SPAN_MS.week))
        .order("created_at", { ascending: false })
        .limit(RELAY_CAPS.perRecipient.perWeek + 1),
      supabase
        .from("invite_relays")
        .select("created_at")
        .gte("created_at", since(RELAY_SPAN_MS.day))
        .order("created_at", { ascending: false })
        .limit(RELAY_CAPS.overall.perDay + 1),
    ]);
    const countError = fromRequester.error ?? toRecipient.error ?? overall.error;
    if (countError) {
      // Can't tell whether it's within the caps, so it isn't passed on.
      await supabase.from("invite_relays").delete().eq("id", filed.id);
      throw new Error(logged(countError));
    }

    const within = relayWithinCaps(
      {
        fromRequester: (fromRequester.data ?? []).map((r) => r.created_at),
        toRecipient: (toRecipient.data ?? []).map((r) => r.created_at),
        overall: (overall.data ?? []).map((r) => r.created_at),
      },
      new Date(now),
    );
    if (!within) {
      await supabase.from("invite_relays").delete().eq("id", filed.id);
      console.warn(`${what}: over a cap, so dropped`);
      return;
    }

    const { subject, html } = inviteRelayedEmail({
      firstName: ask.firstName,
      lastName: ask.lastName,
      email: ask.email,
      url: `${getSiteUrl()}${relayHref(filed.id)}`,
    });
    const sent = await sendEmail({ to: recipient.email, subject, html });
    await supabase
      .from("invite_relays")
      .update({ email_sent: sent.ok })
      .eq("id", filed.id);
    // Resend's error can repeat the address, so only the outcome is logged;
    // the row keeps it too (`email_sent`).
    if (sent.ok) console.info(`${what}: emailed the member`);
    else console.error(`${what}: the email to the member didn't send`);
  } catch (err) {
    console.error(
      `${what}: couldn't pass it on — ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }
}
