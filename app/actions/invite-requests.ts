"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { inviteApprovedEmail } from "@/lib/emails/invite-approved";
import { inviteSentEmail } from "@/lib/emails/invite-sent";
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

  const url = `${getSiteUrl()}/join/${invite.token}`;
  const { subject, html } = inviteApprovedEmail({
    firstName: request.first_name,
    inviterName: admin.display_name ?? "A family member",
    url,
  });
  const sent = await sendEmail({ to: request.email, subject, html });

  const { error: updateError } = await supabase
    .from("invite_requests")
    .update({
      status: "approved",
      reviewed_by: admin.auth_user_id,
      reviewed_at: new Date().toISOString(),
      invite_id: invite.id,
      email_sent: sent.ok,
    })
    .eq("id", id)
    .eq("status", "pending");

  if (updateError) {
    return { error: "Could not update that request. Try again." };
  }

  revalidatePath("/admin");
  return {
    url,
    emailed: sent.ok,
    emailError: sent.ok ? undefined : sent.error,
  };
}

/**
 * Admin: send the invite email again for an already-approved request — the
 * recovery path when the first send failed (a bounce, or no mail provider
 * configured at the time) or the recipient simply lost it.
 *
 * Deliberately reuses the invite minted at approval instead of creating a
 * fresh one: any link already in the wild keeps working, and the 14-day
 * clock is not quietly reset. That also means an expired invite can't be
 * revived here — delete the record and invite them again.
 */
export async function resendInviteEmail(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("invite_requests")
    .select("id, status, source, first_name, email, invites(token, status, expires_at)")
    .eq("id", id)
    .maybeSingle();

  if (!request) return { error: "That request no longer exists." };
  if (request.status !== "approved") {
    return { error: "Only an approved request has an invite to resend." };
  }

  // One-to-one FK that PostgREST still hands back as an array.
  const invite = Array.isArray(request.invites)
    ? request.invites[0]
    : request.invites;

  if (!invite) return { error: "That approval never minted an invite link." };
  if (invite.status === "accepted") {
    return { error: "They have already joined — there is nothing left to send." };
  }
  if (invite.status !== "active") {
    return { error: "That invite link has been revoked." };
  }
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return {
      error: "That invite link has expired. Delete it and invite them again.",
    };
  }

  const inviterName = admin.display_name ?? "A family member";
  const url = `${getSiteUrl()}/join/${invite.token}`;
  // Keep the original wording: nobody asked for a direct invite, so it must
  // not come back claiming their request was approved.
  const { subject, html } =
    request.source === "direct"
      ? inviteSentEmail({ firstName: request.first_name, inviterName, url })
      : inviteApprovedEmail({ firstName: request.first_name, inviterName, url });

  const sent = await sendEmail({ to: request.email, subject, html });

  const { error: updateError } = await supabase
    .from("invite_requests")
    .update({ email_sent: sent.ok })
    .eq("id", id);

  revalidatePath("/admin");

  if (!sent.ok) return { error: `Still couldn't send it — ${sent.error}` };
  if (updateError) {
    return { error: "Email sent, but the record still shows it as failed." };
  }
  return { ok: true };
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

/**
 * Admin: erase an invite record outright — both a pending request in the
 * review queue and a reviewed one in the sent-invites history.
 *
 * If approving it minted a link, that invite goes too, so a link that hasn't
 * been used yet stops working. `invite_requests.invite_id` is `on delete set
 * null`, so the invite would otherwise outlive the record that names it.
 * Who-invited-whom is unaffected: `profiles.invited_by_user_id` points at the
 * inviter's profile, not at the invite row.
 */
export async function deleteInviteRequest(
  id: string,
): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("invite_requests")
    .select("id, invite_id")
    .eq("id", id)
    .maybeSingle();

  // Already gone — someone else deleted it. Nothing left to do.
  if (!request) {
    revalidatePath("/admin");
    return {};
  }

  const { error } = await supabase.from("invite_requests").delete().eq("id", id);
  if (error) return { error: "Could not delete that record. Try again." };

  if (request.invite_id) {
    const { error: inviteError } = await supabase
      .from("invites")
      .delete()
      .eq("id", request.invite_id);
    if (inviteError) {
      revalidatePath("/admin");
      return { error: "Record deleted, but its invite link is still live." };
    }
  }

  revalidatePath("/admin");
  return {};
}
