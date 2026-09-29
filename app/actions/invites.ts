"use server";

import { INVITED_AS } from "@/lib/account-types";
import { requireProfile } from "@/lib/auth";
import {
  mintClaimInvite,
  type ClaimInviteState,
} from "@/lib/claim-invite-send.server";
import { sendEmail } from "@/lib/email";
import { isEmailAddress } from "@/lib/email-address";
import { inviteSentEmail } from "@/lib/emails/invite-sent";
import { expiresAfter } from "@/lib/expiry";
import { mintFounderInvite } from "@/lib/founder-invites.server";
import { INVITE_LIFETIME_DAYS } from "@/lib/limits";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidateTreePages } from "@/lib/revalidate";
import { MAX_NAME_LENGTH } from "@/lib/request-forms";
import { membershipOf, rootOf } from "@/lib/tree-context";

const MAX_DIRECT_INVITE_ROWS = 20;

export type DirectInviteRow = {
  firstName: string;
  lastName: string;
  email: string;
};

export type DirectInviteResult = {
  email: string;
  /** False only if minting the link itself failed — the row is unusable. */
  minted: boolean;
  /** Only meaningful when `minted` is true. */
  emailed: boolean;
  error?: string;
};

export type SendDirectInvitesState = {
  results?: DirectInviteResult[];
  error?: string;
};

function checkRows(rows: DirectInviteRow[]): { rows?: DirectInviteRow[]; error?: string } {
  const trimmed = rows
    .map((r) => ({
      firstName: r.firstName.trim(),
      lastName: r.lastName.trim(),
      email: r.email.trim().toLowerCase(),
    }))
    .filter((r) => r.firstName || r.lastName || r.email);

  if (trimmed.length === 0) {
    return { error: "Add at least one person to invite." };
  }
  if (trimmed.length > MAX_DIRECT_INVITE_ROWS) {
    return { error: `Send at most ${MAX_DIRECT_INVITE_ROWS} invites at a time.` };
  }

  const seen = new Set<string>();
  for (const r of trimmed) {
    if (!r.firstName || !r.lastName) {
      return { error: `${r.email || "One row"} is missing a first or last name.` };
    }
    if (r.firstName.length > MAX_NAME_LENGTH || r.lastName.length > MAX_NAME_LENGTH) {
      return { error: "A name is too long." };
    }
    if (!isEmailAddress(r.email)) {
      return { error: `"${r.email}" isn't a valid email address.` };
    }
    if (seen.has(r.email)) {
      return { error: `${r.email} is listed more than once.` };
    }
    seen.add(r.email);
  }
  return { rows: trimmed };
}

/**
 * Mint an invite into one tree for each row and email it directly to that
 * person — no public request involved. Open to any member there, and each
 * joins as a Leaf. Each row also becomes an
 * `invite_requests` row (source = 'direct', pre-approved) purely so it shows
 * up in the Roots' "Sent invites" history alongside request-driven approvals.
 *
 * The invite is bound to the address, so opening it signs them straight in
 * (`signInWithInvite`). Only a Root or the service role may bind one
 * (`invites_guard`), hence the service-role writes: the inviter's permission
 * is checked here, and the token goes to the recipient's inbox, never back to
 * the inviter.
 */
export async function sendDirectInvites(
  treeId: string,
  rows: DirectInviteRow[],
): Promise<SendDirectInvitesState> {
  const { membership, error: notMember } = await membershipOf(treeId);
  if (!membership) return { error: notMember };
  const inviter = membership.profile;

  const checked = checkRows(rows);
  if (checked.error || !checked.rows) return { error: checked.error };

  const supabase = createAdminClient();
  const results: DirectInviteResult[] = [];

  for (const row of checked.rows) {
    const { data: invite, error: inviteError } = await supabase
      .from("invites")
      .insert({
        tree_id: treeId,
        created_by: inviter.auth_user_id,
        status: "active",
        expires_at: expiresAfter(INVITE_LIFETIME_DAYS),
        joins_as: INVITED_AS.key,
        // The link signs this address in — see `signInWithInvite`.
        invited_email: row.email,
      })
      .select("id, token")
      .single();

    if (inviteError || !invite) {
      results.push({ email: row.email, minted: false, emailed: false, error: "Could not create a link." });
      continue;
    }

    const url = `${getSiteUrl()}/join/${invite.token}`;
    const { subject, html } = inviteSentEmail({
      firstName: row.firstName,
      inviterName: inviter.display_name ?? "A family member",
      url,
    });
    const sent = await sendEmail({ to: row.email, subject, html });

    // Best-effort history row. If it fails the invite itself is still valid,
    // so this doesn't fail the row.
    await supabase.from("invite_requests").insert({
      tree_id: treeId,
      first_name: row.firstName,
      last_name: row.lastName,
      email: row.email,
      source: "direct",
      status: "approved",
      reviewed_by: inviter.auth_user_id,
      reviewed_at: new Date().toISOString(),
      invite_id: invite.id,
      email_sent: sent.ok,
    });

    results.push({
      email: row.email,
      minted: true,
      emailed: sent.ok,
      error: sent.ok ? undefined : sent.error,
    });
  }

  revalidateTreePages();
  return { results };
}

/**
 * Root: invite someone to found a tree of their own (Step 25). With a beta
 * reviewer approving someone off the waitlist (Step 28, `approveTreeRequest`),
 * it's how a brand-new family gets in. Redeeming creates a fresh tree (named
 * by `private.default_tree_name`), makes them its Root, and lands them on its
 * onboarding. The invite is recorded against the inviting tree so it shows up
 * in that tree's history; nothing from this tree is copied over.
 */
export async function sendFounderInvites(
  treeId: string,
  rows: DirectInviteRow[],
): Promise<SendDirectInvitesState> {
  const { membership, error: notRoot } = await rootOf(treeId);
  if (!membership) return { error: notRoot };
  const inviter = membership.profile;

  const checked = checkRows(rows);
  if (checked.error || !checked.rows) return { error: checked.error };

  const results: DirectInviteResult[] = [];
  for (const row of checked.rows) {
    const minted = await mintFounderInvite(treeId, inviter, row, "direct");
    results.push({
      email: row.email,
      minted: minted.inviteId !== null,
      emailed: minted.emailed,
      error: minted.error,
    });
  }

  revalidateTreePages();
  return { results };
}

export type { ClaimInviteState } from "@/lib/claim-invite-send.server";

/**
 * Email an invite for one specific unclaimed entry.
 *
 * The invite carries the person on it, which does two things the general
 * invite can't: the join page names the entry, and whoever redeems the link
 * may claim *that* entry without passing the fuzzy name match — someone who
 * tends the entry picking it and typing the address is the stronger signal,
 * and the name rule is what would otherwise block a married surname or a
 * nickname. See supabase/migrations/20260904100000_invite_to_claim_entry.sql.
 *
 * Open to whoever could edit the entry (`private.can_invite_to_claim`, Step
 * 22.1), judged on the entry's home tree: a Root anywhere on it, a Branch on
 * their side, a Leaf on what they added. The newcomer joins the home tree as
 * a Leaf. Like a direct invite it keeps a "Sent invites" record for the
 * home tree's Roots, and the entry's card says who sent it (Step 38).
 *
 * With `treeId` the newcomer joins that tree instead, where the entry must
 * be placed and the inviter a member — the tree a relayed ask's member
 * picked (Step 41.1), as a request approved as an entry joins the request's
 * tree (Step 30.3). The right to hand the entry over is still judged on its
 * home tree, and the record goes to the Roots of the tree they join.
 */
export async function sendClaimInvite(
  personId: string,
  email: string,
  treeId?: string,
): Promise<ClaimInviteState> {
  const inviter = await requireProfile();
  const result = await mintClaimInvite(inviter, personId, email, treeId);
  if (result.minted) revalidateTreePages();
  return result;
}

/**
 * Root: delete an invite link outright, killing it if nobody has used it.
 *
 * Meant for bare links and archived invites. A "Sent invites" record naming
 * the link goes with it, so it can't outlive the link it names — the live
 * history deletes through that record instead (`deleteInviteRequest`), which
 * comes to the same thing. RLS holds it to a Root of the invite's tree.
 */
export async function deleteInvite(id: string): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();

  const { error: requestError } = await supabase
    .from("invite_requests")
    .delete()
    .eq("invite_id", id);
  if (requestError) return { error: "Could not delete that invite. Try again." };

  const { data, error } = await supabase
    .from("invites")
    .delete()
    .eq("id", id)
    .select("id");
  // Its "Sent invites" record is gone by now, so the page is drawn again
  // even when the link itself couldn't be deleted (Step 61).
  revalidateTreePages();
  if (error) return { error: "Could not delete that link. Try again." };
  if (!data || data.length === 0) return { error: "Only a Root of this tree can delete that link." };
  return {};
}
