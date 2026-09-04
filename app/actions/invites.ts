"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireProfile } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { claimInviteEmail } from "@/lib/emails/claim-invite";
import { inviteSentEmail } from "@/lib/emails/invite-sent";
import { personDisplayName } from "@/lib/person-name";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

const INVITE_TTL_DAYS = 14;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 80;
const MAX_DIRECT_INVITE_ROWS = 20;

export type CreateInviteState = {
  url?: string;
  error?: string;
};

/** Mint a fresh, inviter-attributed, single-use invite link. */
export async function createInvite(): Promise<CreateInviteState> {
  const profile = await requireProfile();
  if (profile.role !== "admin" && !profile.can_invite) {
    return { error: "You don't have permission to create invites." };
  }

  const supabase = await createClient();

  const { data: tree, error: treeError } = await supabase
    .from("trees")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (treeError || !tree) {
    return { error: "No family tree exists yet." };
  }

  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: invite, error } = await supabase
    .from("invites")
    .insert({
      tree_id: tree.id,
      created_by: profile.auth_user_id,
      status: "active",
      expires_at: expiresAt,
    })
    .select("token")
    .single();

  if (error || !invite) {
    return { error: "Could not create an invite link. Try again." };
  }

  revalidatePath("/admin");
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

/**
 * Admin: mint an invite for each row and email it directly to that person —
 * no public request involved. Each row also becomes an `invite_requests` row
 * (source = 'direct', pre-approved) purely so it shows up in the same "Sent
 * invites" history as a request-driven approval.
 */
export async function sendDirectInvites(
  rows: DirectInviteRow[],
): Promise<SendDirectInvitesState> {
  const admin = await requireAdmin();

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

  const supabase = await createClient();
  const { data: tree } = await supabase
    .from("trees")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!tree) return { error: "No family tree exists yet." };

  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const results: DirectInviteResult[] = [];

  for (const row of trimmed) {
    const { data: invite, error: inviteError } = await supabase
      .from("invites")
      .insert({
        tree_id: tree.id,
        created_by: admin.auth_user_id,
        status: "active",
        expires_at: expiresAt,
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
      inviterName: admin.display_name ?? "A family member",
      url,
    });
    const sent = await sendEmail({ to: row.email, subject, html });

    // Best-effort history row — an admin/RLS write, not the service role.
    // If it fails the invite itself is still valid, so this doesn't fail the row.
    await supabase.from("invite_requests").insert({
      first_name: row.firstName,
      last_name: row.lastName,
      email: row.email,
      source: "direct",
      status: "approved",
      reviewed_by: admin.auth_user_id,
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

  revalidatePath("/admin");
  return { results };
}

export type ClaimInviteState = {
  /** The address the link went to, for the confirmation message. */
  email?: string;
  error?: string;
};

/**
 * Admin: email an invite for one specific unclaimed entry.
 *
 * The invite carries the person on it, which does two things the general
 * invite can't: the join page names the entry, and whoever redeems the link
 * may claim *that* entry without passing the fuzzy name match — an admin
 * picking the entry and typing the address is the stronger signal, and the
 * name rule is what would otherwise block a married surname or a nickname.
 * See supabase/migrations/20260904100000_invite_to_claim_entry.sql.
 */
export async function sendClaimInvite(
  personId: string,
  email: string,
): Promise<ClaimInviteState> {
  const admin = await requireAdmin();

  const address = email.trim().toLowerCase();
  if (!EMAIL_RE.test(address)) {
    return { error: "That doesn't look like an email address." };
  }

  const supabase = await createClient();

  const { data: person } = await supabase
    .from("people")
    .select("id, tree_id, first_name, preferred_name, last_name, owner_user_id, created_by")
    .eq("id", personId)
    .maybeSingle();

  if (!person) return { error: "That entry no longer exists." };

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

  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: invite, error } = await supabase
    .from("invites")
    .insert({
      tree_id: person.tree_id,
      created_by: admin.auth_user_id,
      status: "active",
      expires_at: expiresAt,
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
    inviterName: admin.display_name ?? "A family member",
    url: `${getSiteUrl()}/join/${invite.token}`,
  });
  const sent = await sendEmail({ to: address, subject, html });

  if (!sent.ok) {
    return {
      error:
        "The link was created but the email didn't send. Try again, or share the link from the admin page.",
    };
  }

  revalidatePath("/tree");
  revalidatePath("/admin");
  return { email: address };
}

/** Admin-only: grant or revoke a member's ability to mint invites. */
export async function setCanInvite(formData: FormData) {
  await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const canInvite = String(formData.get("canInvite") ?? "") === "true";
  if (!userId) return;

  const supabase = await createClient();
  await supabase
    .from("profiles")
    .update({ can_invite: canInvite })
    .eq("auth_user_id", userId);

  revalidatePath("/admin");
}

/**
 * Admin: delete an invite link outright, killing it if nobody has used it.
 *
 * Only meant for bare links — ones with a recipient on record are deleted
 * through their `invite_requests` row instead, so that row doesn't outlive
 * the link it names. Deleting an already-accepted link is harmless: joining
 * reads the invite once, and `profiles.invited_by_user_id` records the
 * inviter independently.
 */
export async function deleteInvite(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("invites").delete().eq("id", id);
  if (error) return { error: "Could not delete that link. Try again." };

  revalidatePath("/admin");
  return {};
}
