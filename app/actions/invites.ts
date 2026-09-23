"use server";

import { revalidatePath } from "next/cache";

import { INVITED_AS, accountTypeOf } from "@/lib/account-types";
import { requireProfile } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { claimInviteEmail } from "@/lib/emails/claim-invite";
import { inviteSentEmail } from "@/lib/emails/invite-sent";
import { mintFounderInvite } from "@/lib/founder-invites.server";
import { personDisplayName } from "@/lib/person-name";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidateTreeAndAccount } from "@/lib/revalidate";
import { getRoleIn, membershipOf, rootOf } from "@/lib/tree-context";

const INVITE_TTL_DAYS = 14;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 80;
const MAX_DIRECT_INVITE_ROWS = 20;

function expiry(): string {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export type CreateInviteState = {
  url?: string;
  error?: string;
};

/**
 * Mint a fresh, inviter-attributed, single-use invite link into one tree. It
 * joins as a Leaf, whoever sends it (Step 34; `private.can_invite_as`).
 */
export async function createInvite(
  treeId: string,
): Promise<CreateInviteState> {
  const { membership, error: notMember } = await membershipOf(treeId);
  if (notMember || !membership) return { error: notMember };

  const supabase = await createClient();
  const { data: invite, error } = await supabase
    .from("invites")
    .insert({
      tree_id: treeId,
      created_by: membership.profile.auth_user_id,
      status: "active",
      expires_at: expiry(),
      joins_as: INVITED_AS.key,
    })
    .select("token")
    .single();

  if (error || !invite) {
    return { error: "Could not create an invite link. Try again." };
  }

  revalidateTreeAndAccount();
  return { url: `${getSiteUrl()}/join/${invite.token}` };
}

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
    if (!EMAIL_RE.test(r.email)) {
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
  if (notMember || !membership) return { error: notMember };
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
        expires_at: expiry(),
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

  revalidateTreeAndAccount();
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
  if (notRoot || !membership) return { error: notRoot };
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

  revalidateTreeAndAccount();
  return { results };
}

export type ClaimInviteState = {
  /** The address the link went to, for the confirmation message. */
  email?: string;
  error?: string;
};

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
 * a Leaf.
 */
export async function sendClaimInvite(
  personId: string,
  email: string,
): Promise<ClaimInviteState> {
  const inviter = await requireProfile();
  const supabase = await createClient();

  const { data: person } = await supabase
    .from("people")
    .select("id, tree_id, first_name, preferred_name, last_name, owner_user_id, created_by")
    .eq("id", personId)
    .maybeSingle();

  if (!person) return { error: "That entry no longer exists." };

  const role = await getRoleIn(person.tree_id);
  if (!role) {
    return { error: "You don't have permission to send invites for this entry." };
  }

  const address = email.trim().toLowerCase();
  if (!EMAIL_RE.test(address)) {
    return { error: "That doesn't look like an email address." };
  }

  // Asked as the inviter: is this entry theirs to hand over? It also covers
  // the entry having gone, or being out of their sight.
  const { data: mayInvite } = await supabase.rpc("can_invite_to_claim", {
    p_person_id: personId,
  });

  // Refuse on anything already spoken for, so an invite can never be used to
  // hand someone else's entry away. Mirrors the guards in `claim_person`.
  const [{ data: claim }, { data: member }] = await Promise.all([
    supabase
      .from("claims")
      .select("id")
      .eq("person_id", personId)
      .eq("status", "approved")
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("auth_user_id")
      .eq("self_person_id", personId)
      .maybeSingle(),
  ]);

  if (claim || member || person.owner_user_id !== person.created_by) {
    return { error: "That entry already belongs to a member." };
  }
  if (mayInvite !== true) {
    return {
      error:
        "You can invite someone to claim only an entry you can edit. Ask a Root to send this one.",
    };
  }

  // Bound to the address, so opening it signs them straight in. Only a Root
  // or the service role may bind one (`invites_guard`), hence the service-role
  // write, as in `sendDirectInvites`: the inviter's right was checked above.
  const { data: invite, error } = await createAdminClient()
    .from("invites")
    .insert({
      tree_id: person.tree_id,
      created_by: inviter.auth_user_id,
      status: "active",
      expires_at: expiry(),
      joins_as: INVITED_AS.key,
      person_id: personId,
      invited_email: address,
    })
    .select("token")
    .single();

  if (error || !invite) {
    return { error: "Could not create an invite link. Try again." };
  }

  const entryName = personDisplayName(person);
  const { subject, html } = claimInviteEmail({
    firstName: person.preferred_name || person.first_name || entryName,
    entryName,
    inviterName: inviter.display_name ?? "A family member",
    url: `${getSiteUrl()}/join/${invite.token}`,
  });
  const sent = await sendEmail({ to: address, subject, html });

  if (!sent.ok) {
    return {
      error: accountTypeOf(role).runsTree
        ? "The link was created but the email didn't send. Try again, or share the link from the admin page."
        : "The link was created but the email didn't send. Try again in a moment.",
    };
  }

  revalidateTreeAndAccount();
  return { email: address };
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
  if (error) return { error: "Could not delete that link. Try again." };
  if (!data || data.length === 0) return { error: "Only a Root of this tree can delete that link." };

  revalidateTreeAndAccount();
  revalidatePath("/account");
  return {};
}
