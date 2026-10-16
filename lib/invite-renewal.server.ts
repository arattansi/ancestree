import "server-only";

import { sendEmail } from "@/lib/email";
import { treeInviteEmail } from "@/lib/emails/tree-invite";
import { inviteUrl } from "@/lib/invite-mint.server";
import { inviteRenewedNotice, lapsedState, type LapsedState } from "@/lib/lapsed-invites";
import { INVITE_LIFETIME_DAYS } from "@/lib/limits";
import { personDisplayName } from "@/lib/person-name";
import { createAdminClient } from "@/lib/supabase/admin";

export type RenewInviteState = {
  /** A fresh link went to the address the invite was for. */
  sent?: boolean;
  /** Nothing went, and why the page should say so instead. */
  state?: LapsedState;
  error?: string;
};

const NOT_SENT = "Couldn’t send a fresh link. Try again in a moment.";

/**
 * A fresh link for an expired invite, emailed to the address it was for
 * (Step 163): whoever holds the old link asks, signed in or not, and only
 * that inbox gets the new one, so the link never comes back here. The
 * database decides whether one may go (`renew_invite`: still worth having,
 * at most once a day) and makes it, or hands back the live one already out
 * to that address for that entry. The email is the first one's kind, again
 * (`treeInviteEmail`); its "Sent invites" record says it went, and whoever
 * sent the first is told (`invite_renewed`). An email that didn't go frees
 * the day's turn, so they can try again.
 */
export async function renewLapsedInvite(token: string): Promise<RenewInviteState> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("renew_invite", {
    p_token: token,
    p_days: INVITE_LIFETIME_DAYS,
  });
  const renewed = data?.[0];
  if (error || !renewed) {
    if (error) console.error(`[invites] renew_invite — ${error.message}`);
    return { error: NOT_SENT };
  }
  if (renewed.outcome === "gone") return { error: "That link no longer works." };
  if (renewed.outcome !== "renewed") return { state: lapsedState(renewed.outcome) };

  const { data: invite } = await admin
    .from("invites")
    .select(
      "tree_id, created_by, person_id, trees(name), profiles!invites_created_by_fkey(display_name), people(first_name, preferred_name, last_name, placeholder_number), invite_requests(id, first_name, last_name, source)",
    )
    .eq("id", renewed.invite_id)
    .maybeSingle();
  if (!invite) return freeTheTurn(token);

  // One-to-one FKs that PostgREST still hands back as arrays.
  const tree = Array.isArray(invite.trees) ? invite.trees[0] : invite.trees;
  const inviter = Array.isArray(invite.profiles) ? invite.profiles[0] : invite.profiles;
  const entry = Array.isArray(invite.people) ? invite.people[0] : invite.people;
  const record = Array.isArray(invite.invite_requests)
    ? invite.invite_requests[0]
    : invite.invite_requests;
  const entryName = entry ? personDisplayName(entry) : null;
  const treeName = tree?.name ?? "your family’s tree";

  const { subject, html } = treeInviteEmail({
    source: record?.source ?? "direct",
    firstName:
      record?.first_name || entry?.preferred_name || entry?.first_name || entryName || "",
    inviterName: inviter?.display_name ?? "A family member",
    treeName,
    url: inviteUrl(renewed.invite_token),
    entryName,
    placeholder: entry?.placeholder_number != null,
  });
  const sent = await sendEmail({ to: renewed.sent_to, subject, html });
  if (!sent.ok) return freeTheTurn(token);

  const recordName = record ? `${record.first_name} ${record.last_name}` : entryName;
  const [{ error: recordError }, { error: noticeError }] = await Promise.all([
    record
      ? admin.from("invite_requests").update({ email_sent: true }).eq("id", record.id)
      : Promise.resolve({ error: null }),
    admin.from("notifications").insert({
      recipient_user_id: invite.created_by,
      type: "invite_renewed",
      body: inviteRenewedNotice({ name: recordName, email: renewed.sent_to, treeName }),
      tree_id: invite.tree_id,
      person_id: invite.person_id,
    }),
  ]);
  if (recordError) console.error(`[invites] renewed, record not updated — ${recordError.message}`);
  if (noticeError) console.error(`[invites] renewed, inviter not told — ${noticeError.message}`);
  return { sent: true };
}

/** The email didn't go: the expired link may ask again today. */
async function freeTheTurn(token: string): Promise<RenewInviteState> {
  await createAdminClient().from("invites").update({ renewed_at: null }).eq("token", token);
  return { error: NOT_SENT };
}
