"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import {
  completeEmailSignIn,
  safeNext,
  signInWithInvite,
} from "@/lib/sign-in.server";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type MagicLinkState = {
  ok?: boolean;
  error?: string;
  email?: string;
};

/**
 * Send a magic-link email. When `inviteToken` is present the callback will
 * redeem that invite on first sign-in; otherwise the callback provisions the
 * profile (admins only — invited members must use their link).
 */
export async function requestMagicLink(
  _prev: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const inviteToken = String(formData.get("inviteToken") ?? "").trim();
  const consent = formData.get("consent");

  if (!EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address.", email };
  }

  if (consent !== "on" && consent !== "true") {
    return {
      error: "Please accept the privacy notice to continue.",
      email,
    };
  }

  const callback = new URL("/auth/callback", getSiteUrl());
  callback.searchParams.set("next", inviteToken ? "/tree" : "/tree");
  if (inviteToken) callback.searchParams.set("invite", inviteToken);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callback.toString(),
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { error: "Could not send the sign-in link. Try again shortly.", email };
  }

  return { ok: true, email };
}

const EMAIL_OTP_TYPES: EmailOtpType[] = [
  "email",
  "magiclink",
  "signup",
  "invite",
  "recovery",
  "email_change",
];

/**
 * The button on /auth/confirm: spend the emailed one-time token. A form POST
 * on purpose — see `completeEmailSignIn` for why the email's GET can't do it.
 */
export async function confirmSignIn(formData: FormData) {
  const tokenHash = String(formData.get("tokenHash") ?? "");
  const type = String(formData.get("type") ?? "") as EmailOtpType;
  const invite = String(formData.get("invite") ?? "").trim() || null;
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!tokenHash || !EMAIL_OTP_TYPES.includes(type)) {
    redirect("/auth/auth-code-error");
  }

  redirect(await completeEmailSignIn({ tokenHash, type, invite, next }));
}

export type AcceptInviteState = {
  error?: string;
  /** The address already has an account — offer the ordinary sign-in. */
  alreadyMember?: boolean;
};

/**
 * The button on an emailed invite: sign straight in as the address the invite
 * went to and join the tree — no second email. Bare links (no recipient) go
 * through `requestMagicLink` instead.
 */
export async function acceptInvite(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const token = String(formData.get("inviteToken") ?? "").trim();
  const consent = formData.get("consent");

  if (consent !== "on" && consent !== "true") {
    return { error: "Please accept the privacy notice to continue." };
  }

  const result = await signInWithInvite(token);
  if (result.ok) redirect("/tree");

  if (result.reason === "already_member") {
    return {
      alreadyMember: true,
      error: "This email already has an ancestree account.",
    };
  }
  if (result.reason === "invalid") {
    return {
      error:
        "This invite is no longer valid. Ask the relative who invited you for a fresh one.",
    };
  }
  return { error: "Could not sign you in. Try again shortly." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
