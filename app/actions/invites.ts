"use server";

import { requireProfile } from "@/lib/auth";
import {
  mintClaimInvite,
  type ClaimInviteState,
} from "@/lib/claim-invite-send.server";
import { isEmailAddress } from "@/lib/email-address";
import { inviteSentEmail } from "@/lib/emails/invite-sent";
import { mintFounderInvites } from "@/lib/founder-invites.server";
import { mintInvites, type MintedInvite } from "@/lib/invite-mint.server";
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
  /** Why it didn't go, in words for the inviter, when there's more to say. */
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
 * Invite people into one tree by name and address, emailed to each of them
 * — no public request involved. Open to any member there, and each joins as
 * a Leaf. Each also gets an `invite_requests` record (source = 'direct',
 * pre-approved) purely so it shows up in the Roots' "Sent invites" history
 * alongside request-driven approvals. All of them go together
 * (`mintInvites`, Step 77.5), and no link comes back to the inviter.
 */
export async function sendDirectInvites(
  treeId: string,
  rows: DirectInviteRow[],
): Promise<SendDirectInvitesState> {
  const { membership, error: notMember } = await membershipOf(treeId);
  if (!membership) return { error: notMember };

  const checked = checkRows(rows);
  if (checked.error || !checked.rows) return { error: checked.error };

  const minted = await mintInvites({
    treeId,
    inviter: membership.profile,
    recipients: checked.rows,
    source: "direct",
    email: (row, { url, inviterName }) =>
      inviteSentEmail({ firstName: row.firstName, inviterName, url }),
  });

  revalidateTreePages();
  return { results: minted.map(directInviteResult) };
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

  const checked = checkRows(rows);
  if (checked.error || !checked.rows) return { error: checked.error };

  const minted = await mintFounderInvites(
    treeId,
    membership.profile,
    checked.rows,
    "direct",
  );

  revalidateTreePages();
  return { results: minted.map(directInviteResult) };
}

/** How a sent invite is reported back: never its link. */
function directInviteResult(invite: MintedInvite): DirectInviteResult {
  return {
    email: invite.email,
    minted: invite.inviteId !== null,
    emailed: invite.emailed,
    error: invite.error,
  };
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
 * tree (Step 30.3), and the tree whose canvas the invite is sent from
 * (Step 84). The record goes to the Roots of the tree they join.
 *
 * A Root of the tree they join may also invite someone to claim any entry
 * it shows that nobody is behind (`private.can_invite_to_claim_on`, Step
 * 84), a basic card included: the invite names it as the card does, and
 * accepting claims it and shows it there in full (Step 83).
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
