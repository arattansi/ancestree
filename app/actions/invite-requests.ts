"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { inviteApprovedEmail } from "@/lib/emails/invite-approved";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TTL_DAYS = 14;
const MAX_NAME_LENGTH = 80;

export type RequestInviteState = {
  ok?: boolean;
  error?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

/**
 * Public: ask an admin for an invite. Written with the service-role client
 * because the requester is not signed in and `invite_requests` is not
 * reachable from `anon`.
 */
export async function requestInvite(
  _prev: RequestInviteState,
  formData: FormData,
): Promise<RequestInviteState> {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const entered = { firstName, lastName, email };

  if (!firstName || !lastName) {
    return { error: "Enter your first and last name.", ...entered };
  }
  if (firstName.length > MAX_NAME_LENGTH || lastName.length > MAX_NAME_LENGTH) {
    return { error: "That name is too long.", ...entered };
  }
  if (!EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address.", ...entered };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("invite_requests")
    .insert({ first_name: firstName, last_name: lastName, email });

  if (error) {
    // Unique violation on the pending-email index: they already asked.
    if (error.code === "23505") return { ok: true, ...entered };
    return { error: "Could not send your request. Try again shortly.", ...entered };
  }

  revalidatePath("/admin");
  return { ok: true, ...entered };
}

/**
 * Admin: approve a request by minting a single-use invite link attributed to
 * the reviewing admin, then emailing it to the requester. The link is also
 * returned so the admin can copy it as a fallback — if the email fails to
 * send, `emailError` is set but the approval itself is not rolled back; the
 * invite is already valid either way.
 */
export async function approveInviteRequest(
  id: string,
): Promise<{ url?: string; emailed?: boolean; emailError?: string; error?: string }> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("invite_requests")
    .select("id, status, first_name, email")
    .eq("id", id)
    .maybeSingle();

  if (!request) return { error: "That request no longer exists." };
  if (request.status !== "pending") {
    return { error: "That request has already been reviewed." };
  }

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
    return { error: "Could not create an invite link. Try again." };
  }

  const { error: updateError } = await supabase
    .from("invite_requests")
    .update({
      status: "approved",
      reviewed_by: admin.auth_user_id,
      reviewed_at: new Date().toISOString(),
      invite_id: invite.id,
    })
    .eq("id", id)
    .eq("status", "pending");

  if (updateError) {
    return { error: "Could not update that request. Try again." };
  }

  const url = `${getSiteUrl()}/join/${invite.token}`;
  const { subject, html } = inviteApprovedEmail({
    firstName: request.first_name,
    inviterName: admin.display_name ?? "A family member",
    url,
  });
  const sent = await sendEmail({ to: request.email, subject, html });

  revalidatePath("/admin");
  return {
    url,
    emailed: sent.ok,
    emailError: sent.ok ? undefined : sent.error,
  };
}

/** Admin: decline a request without minting anything. */
export async function declineInviteRequest(
  id: string,
): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("invite_requests")
    .update({
      status: "declined",
      reviewed_by: admin.auth_user_id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");

  if (error) return { error: "Could not decline that request. Try again." };

  revalidatePath("/admin");
  return {};
}
