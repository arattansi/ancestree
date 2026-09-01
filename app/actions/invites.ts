"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireProfile } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { inviteSentEmail } from "@/lib/emails/invite-sent";
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
