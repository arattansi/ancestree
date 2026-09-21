import "server-only";

import type { EmailOtpType } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Only allow same-origin relative redirect targets. */
export function safeNext(next: string | null | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/tree";
}

/**
 * Turn a fresh session into a member: redeem the invite, or provision an
 * allowlisted admin. Returns where to send them.
 */
export async function establishMembership(
  supabase: ServerClient,
  {
    invite,
    next,
    displayName,
  }: { invite?: string | null; next: string; displayName?: string },
): Promise<string> {
  if (invite) {
    const { error } = await supabase.rpc("redeem_invite", {
      p_token: invite,
      p_display_name: displayName,
    });
    return error ? "/join?error=invite" : next;
  }
  const { error } = await supabase.rpc("ensure_profile", {});
  return error ? "/join?status=pending" : next;
}

/**
 * Spend the one-time token from a sign-in email and return where to go next.
 *
 * Only ever called from a POST (the button on /auth/confirm), never from the
 * GET the email links to: mail scanners — Outlook Safe Links above all — open
 * every link in a message before the recipient does, and a GET that verified
 * would hand them the token and leave the real click with "already used".
 */
export async function completeEmailSignIn({
  tokenHash,
  type,
  invite,
  next,
}: {
  tokenHash: string;
  type: EmailOtpType;
  invite?: string | null;
  next: string;
}): Promise<string> {
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    // A second tap on a link this browser already spent: they are signed in,
    // so carry on rather than telling them the link is used up.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "/auth/auth-code-error";
  }

  return establishMembership(supabase, { invite, next });
}

export type InviteRecipient = {
  email: string;
  /** "First Last" when the invite was sent to a named person. */
  name: string | null;
  /** True when they asked to join — they accepted the privacy notice then. */
  requested: boolean;
};

/**
 * Who a live invite was emailed to, or `null` for a bare link (or a dead one).
 * An invite with a recipient doubles as their sign-in link; a bare link has
 * nobody to sign in, so it still asks for an address.
 */
export async function getInviteRecipient(
  token: string,
): Promise<InviteRecipient | null> {
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("invites")
    .select(
      "status, expires_at, invited_email, invite_requests(first_name, last_name, email, source)",
    )
    .eq("token", token)
    .maybeSingle();

  if (!invite || invite.status !== "active") return null;
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return null;

  // One-to-one FK that PostgREST still hands back as an array.
  const request = Array.isArray(invite.invite_requests)
    ? invite.invite_requests[0]
    : invite.invite_requests;

  // Invites approved before `invited_email` was filled in only have the
  // address on their request row.
  const email = (invite.invited_email ?? request?.email ?? "").trim().toLowerCase();
  if (!email) return null;

  const name = request
    ? `${request.first_name} ${request.last_name}`.trim() || null
    : null;
  return { email, name, requested: request?.source === "request" };
}

export type InviteSignInResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "already_member" | "failed" };

/**
 * Accept an emailed invite in one step: create the account for the address
 * the invite went to, sign this browser in as it, and redeem the invite.
 *
 * The invite link reached that inbox, which is all a sign-in email would
 * prove — so we mint the one-time token ourselves and spend it on the spot
 * instead of mailing a second link. Refuses an address that is already a
 * member: their invite must not double as a 14-day key to a live account.
 */
export async function signInWithInvite(token: string): Promise<InviteSignInResult> {
  const recipient = await getInviteRecipient(token);
  if (!recipient) return { ok: false, reason: "invalid" };

  const admin = createAdminClient();

  // Make sure the account exists and is confirmed. An address that has signed
  // in before comes back as "already registered", which is fine.
  await admin.auth.admin.createUser({
    email: recipient.email,
    email_confirm: true,
  });

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: recipient.email,
  });
  if (linkError || !link.user || !link.properties?.hashed_token) {
    return { ok: false, reason: "failed" };
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("auth_user_id")
    .eq("auth_user_id", link.user.id)
    .maybeSingle();
  if (existing) return { ok: false, reason: "already_member" };

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: link.properties.hashed_token,
  });
  if (verifyError) return { ok: false, reason: "failed" };

  const { error: redeemError } = await supabase.rpc("redeem_invite", {
    p_token: token,
    p_display_name: recipient.name ?? undefined,
  });
  if (redeemError) return { ok: false, reason: "invalid" };

  return { ok: true };
}
