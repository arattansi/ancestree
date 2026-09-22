import "server-only";

import type { Profile } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { founderApprovedEmail } from "@/lib/emails/founder-approved";
import { founderInviteEmail } from "@/lib/emails/founder-invite";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

const INVITE_TTL_DAYS = 14;

export type FounderInviteRecipient = {
  firstName: string;
  lastName: string;
  email: string;
};

export type MintedFounderInvite = {
  /** Null when the invite itself couldn't be created — nothing was sent. */
  inviteId: string | null;
  url: string | null;
  emailed: boolean;
  error?: string;
};

/**
 * Mint one founder invite (Step 25) on `treeId`, attributed to `inviter`,
 * bound to the recipient's address, and email it. Redeeming plants a fresh
 * tree with them as its Root.
 *
 * `source` says how it started, and so which email goes: a Root sending one
 * unasked (`direct`), or a beta reviewer approving a waitlist sign-up
 * (`request`, Step 26). Either way a "Sent invites" record is kept on
 * `treeId`, so the invite can be resent or killed from there.
 *
 * The caller must already have checked that `inviter` is a Root of
 * `treeId`: binding an address takes a Root or the service role
 * (`invites_guard`), and this writes with the service role. Not a server
 * action — keep it out of "use server" files.
 */
export async function mintFounderInvite(
  treeId: string,
  inviter: Profile,
  recipient: FounderInviteRecipient,
  source: "direct" | "request",
): Promise<MintedFounderInvite> {
  const supabase = createAdminClient();
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: invite, error: inviteError } = await supabase
    .from("invites")
    .insert({
      tree_id: treeId,
      created_by: inviter.auth_user_id,
      status: "active",
      expires_at: expiresAt,
      joins_as: "member",
      founds_tree: true,
      invited_email: recipient.email,
    })
    .select("id, token")
    .single();

  if (inviteError || !invite) {
    return { inviteId: null, url: null, emailed: false, error: "Could not create a link." };
  }

  const url = `${getSiteUrl()}/join/${invite.token}`;
  const inviterName = inviter.display_name ?? "A family member";
  const { subject, html } =
    source === "direct"
      ? founderInviteEmail({ firstName: recipient.firstName, inviterName, url })
      : founderApprovedEmail({ firstName: recipient.firstName, inviterName, url });
  const sent = await sendEmail({ to: recipient.email, subject, html });

  // Best-effort history row. If it fails the invite itself is still valid,
  // so this doesn't fail the send.
  await supabase.from("invite_requests").insert({
    tree_id: treeId,
    first_name: recipient.firstName,
    last_name: recipient.lastName,
    email: recipient.email,
    source,
    status: "approved",
    reviewed_by: inviter.auth_user_id,
    reviewed_at: new Date().toISOString(),
    invite_id: invite.id,
    email_sent: sent.ok,
  });

  return {
    inviteId: invite.id,
    url,
    emailed: sent.ok,
    error: sent.ok ? undefined : sent.error,
  };
}
