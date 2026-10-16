"use server";

import { requireProfile } from "@/lib/auth";
import {
  mintClaimInvite,
  mintClaimLink,
  type ClaimInviteState,
} from "@/lib/claim-invite-send.server";
import { isEmailAddress } from "@/lib/email-address";
import { inviteSentEmail } from "@/lib/emails/invite-sent";
import type { MatchAnswer } from "@/lib/invite-matches";
import { inviteQuestions, type InviteQuestion } from "@/lib/invite-matches.server";
import { mintInvites, type MintedInvite } from "@/lib/invite-mint.server";
import { renewLapsedInvite, type RenewInviteState } from "@/lib/invite-renewal.server";
import { createClient } from "@/lib/supabase/server";
import { revalidateTreePages } from "@/lib/revalidate";
import { MAX_NAME_LENGTH } from "@/lib/request-forms";
import { membershipOf } from "@/lib/tree-context";

const MAX_DIRECT_INVITE_ROWS = 20;

export type DirectInviteRow = {
  firstName: string;
  lastName: string;
  email: string;
  /**
   * The inviter's answer when the name matched an entry on the tree (Step
   * 162): yes sends an invite to claim it instead.
   */
  match?: MatchAnswer | null;
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
  /**
   * Rows whose name is someone on the tree, to ask about before anything
   * goes (Step 162). Nothing was sent.
   */
  ask?: InviteQuestion[];
  error?: string;
};

export type { InviteQuestion } from "@/lib/invite-matches.server";

function checkRows(rows: DirectInviteRow[]): { rows?: DirectInviteRow[]; error?: string } {
  const trimmed = rows
    .map((r) => ({
      firstName: r.firstName.trim(),
      lastName: r.lastName.trim(),
      email: r.email.trim().toLowerCase(),
      // Only its shape is trusted: a yes is checked again as it's sent.
      match:
        r.match && typeof r.match.entryId === "string"
          ? { entryId: r.match.entryId, isThem: r.match.isThem === true }
          : null,
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
 *
 * A name that is exactly someone's on the tree, who the inviter could
 * invite to claim their entry, is asked about first (Step 162): nothing
 * goes until each is answered (`ask`). A yes sends that row as an invite
 * to claim the entry (`mintClaimInvite`, which checks it again); a no, the
 * plain invite. A relayed ask lists its own matches (Step 41.1), so it
 * sends with `askFirst: false`.
 */
export async function sendDirectInvites(
  treeId: string,
  rows: DirectInviteRow[],
  { askFirst = true }: { askFirst?: boolean } = {},
): Promise<SendDirectInvitesState> {
  const { membership, error: notMember } = await membershipOf(treeId);
  if (!membership) return { error: notMember };

  const checked = checkRows(rows);
  if (checked.error || !checked.rows) return { error: checked.error };

  if (askFirst) {
    const ask = await inviteQuestions(treeId, checked.rows);
    if (ask.length > 0) return { ask };
  }

  const claims = checked.rows.filter((r) => r.match?.isThem);
  const plain = checked.rows.filter((r) => !r.match?.isThem);
  const [minted, claimed] = await Promise.all([
    mintInvites({
      treeId,
      inviter: membership.profile,
      recipients: plain.map(({ firstName, lastName, email }) => ({
        firstName,
        lastName,
        email,
      })),
      source: "direct",
      email: (row, sent) => inviteSentEmail({ firstName: row.firstName, ...sent }),
    }),
    Promise.all(
      claims.map(async (r): Promise<DirectInviteResult> => {
        const res = await mintClaimInvite(
          membership.profile,
          r.match!.entryId,
          r.email,
          treeId,
        );
        return {
          email: r.email,
          minted: !!res.minted,
          emailed: !!res.minted && !res.error,
          error: res.minted ? undefined : res.error,
        };
      }),
    ),
  ]);

  revalidateTreePages();
  return { results: [...minted.map(directInviteResult), ...claimed] };
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
 * A link to claim one living, unclaimed entry on `treeId`, bound to no
 * address, to send however they like (Step 143, the Root console's list;
 * Step 151, the people a member added). Anyone who may invite someone to
 * claim it may make one. A live one already made for it comes back
 * instead.
 */
export async function makeClaimLink(
  personId: string,
  treeId: string,
): Promise<{ url?: string; error?: string }> {
  const inviter = await requireProfile();
  const { url, minted, error } = await mintClaimLink(inviter, personId, treeId);
  if (minted) revalidateTreePages();
  return { url, error };
}

export type { RenewInviteState } from "@/lib/invite-renewal.server";

/**
 * Whoever holds an expired invite's link asks for a fresh one, emailed to
 * the address it was for (Step 163): signed in or not, as the link is the
 * secret and the new one goes only to that inbox. At most once a day an
 * invite (`renewLapsedInvite`).
 */
export async function renewInvite(token: string): Promise<RenewInviteState> {
  if (typeof token !== "string" || !token || token.length > 200) {
    return { error: "That link no longer works." };
  }
  return renewLapsedInvite(token);
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
