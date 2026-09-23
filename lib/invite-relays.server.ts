import "server-only";

import { sendEmail } from "@/lib/email";
import { inviteRelayedEmail } from "@/lib/emails/invite-relayed";
import {
  RELAY_CAPS,
  RELAY_NOTE_KEPT_MS,
  RELAY_SPAN_MS,
  askWithinCaps,
  memberWithinCaps,
  relayHref,
  relayLapseCutoff,
} from "@/lib/invite-relays";
import type { NameAndEmail } from "@/lib/request-forms";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

export type RelayAsk = NameAndEmail & {
  /** The relative's address, trimmed and lower-cased. */
  relativeEmail: string;
};

type AdminClient = ReturnType<typeof createAdminClient>;

const WHAT = "[invite-relays] ask to a relative";

/** A database error, without the row it was about: nothing typed reaches a log. */
function logged(error: { code?: string; message?: string }): string {
  return `${error.code ?? "?"} ${error.message ?? ""}`.trim();
}

/**
 * Delete what's past keeping (Step 41.5): notes of asks older than a day,
 * which no cap counts any more, and asks left pending for 30 days, which
 * have lapsed, so the same address may ask that member again. There's no
 * schedule (pg_cron isn't enabled), so each ask clears up after the ones
 * before it. A failure is logged and doesn't stop the ask.
 */
async function clearOldAsks(supabase: AdminClient, now: Date): Promise<void> {
  const [notes, lapsed] = await Promise.all([
    supabase
      .from("invite_relay_asks")
      .delete()
      .lt("created_at", new Date(now.getTime() - RELAY_NOTE_KEPT_MS).toISOString()),
    supabase
      .from("invite_relays")
      .delete()
      .eq("status", "pending")
      .lte("created_at", relayLapseCutoff(now)),
  ]);
  const error = notes.error ?? lapsed.error;
  if (error) console.error(`${WHAT}: couldn't clear old asks — ${logged(error)}`);
}

/**
 * Pass a newcomer's ask on to the relative whose address they gave (Step
 * 30.5): if it belongs to a member who lets relatives ask, file it
 * (`invite_relays`) and email them, with a button to the invite filled in
 * on their account page. Runs after the newcomer has their answer
 * (`after()` in `askRelative`), so nothing here can change what they're
 * told or how long it takes. Every outcome is silent: past a cap, nobody
 * by that address (or a member who has turned asks off), asked already
 * (open or dismissed), or a failure. Each is logged without a name or an
 * address, and swallowed.
 *
 * Every ask is noted first (`invite_relay_asks`, Step 41.5: the address
 * asking and when, never the relative's), and the caps on that address and
 * on the whole site are counted from the notes before anyone's address is
 * looked up, so an ask past one looks nobody up and its note is taken back.
 * An ask for a member is then filed and counted against their caps, and
 * taken back if it's over one. Each count comes after the write, so two
 * asks at once can't both slip under a cap.
 */
export async function passOnRelay(ask: RelayAsk): Promise<void> {
  try {
    const supabase = createAdminClient();
    const now = new Date();
    const since = (ms: number) => new Date(now.getTime() - ms).toISOString();

    await clearOldAsks(supabase, now);

    // Note the ask, whoever the address belongs to, and count the notes.
    const { data: noted, error: noteError } = await supabase
      .from("invite_relay_asks")
      .insert({ email: ask.email })
      .select("id")
      .single();
    if (noteError) throw new Error(logged(noteError));

    const [fromRequester, overall] = await Promise.all([
      supabase
        .from("invite_relay_asks")
        .select("created_at")
        .eq("email", ask.email)
        .gte("created_at", since(RELAY_SPAN_MS.day))
        .order("created_at", { ascending: false })
        .limit(RELAY_CAPS.perRequester.perDay + 1),
      supabase
        .from("invite_relay_asks")
        .select("created_at")
        .gte("created_at", since(RELAY_SPAN_MS.day))
        .order("created_at", { ascending: false })
        .limit(RELAY_CAPS.overall.perDay + 1),
    ]);
    const noteCountError = fromRequester.error ?? overall.error;
    if (noteCountError) {
      // Can't tell whether it's within the caps, so it isn't passed on.
      await supabase.from("invite_relay_asks").delete().eq("id", noted.id);
      throw new Error(logged(noteCountError));
    }
    const withinAskCaps = askWithinCaps(
      {
        fromRequester: (fromRequester.data ?? []).map((r) => r.created_at),
        overall: (overall.data ?? []).map((r) => r.created_at),
      },
      now,
    );
    if (!withinAskCaps) {
      await supabase.from("invite_relay_asks").delete().eq("id", noted.id);
      console.warn(`${WHAT}: over a cap, so dropped before the lookup`);
      return;
    }

    const { data: found, error: lookupError } = await supabase.rpc(
      "invite_relay_recipient",
      { p_email: ask.relativeEmail },
    );
    if (lookupError) throw new Error(logged(lookupError));
    const recipient = found?.[0];
    // Nobody by that address, or a member who has turned asks off: nothing
    // more to keep, and nobody to tell.
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

    const toRecipient = await supabase
      .from("invite_relays")
      .select("created_at")
      .eq("recipient_user_id", recipient.user_id)
      .gte("created_at", since(RELAY_SPAN_MS.week))
      .order("created_at", { ascending: false })
      .limit(RELAY_CAPS.perRecipient.perWeek + 1);
    if (toRecipient.error) {
      // Can't tell whether it's within their caps, so it isn't passed on.
      await supabase.from("invite_relays").delete().eq("id", filed.id);
      throw new Error(logged(toRecipient.error));
    }
    if (!memberWithinCaps((toRecipient.data ?? []).map((r) => r.created_at), now)) {
      await supabase.from("invite_relays").delete().eq("id", filed.id);
      console.warn(`${WHAT}: over the member's cap, so dropped`);
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
    if (sent.ok) console.info(`${WHAT}: emailed the member`);
    else console.error(`${WHAT}: the email to the member didn't send`);
  } catch (err) {
    console.error(
      `${WHAT}: couldn't pass it on — ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }
}
