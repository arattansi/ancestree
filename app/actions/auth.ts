"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { signInAsksName, type JoiningName } from "@/lib/joining-name";
import { signInNeedsConsent } from "@/lib/privacy-consent";
import {
  problemState,
  readNameAndEmail,
  type RequestFormState,
} from "@/lib/request-forms";
import { sameOriginPath } from "@/lib/safe-next";
import { signInCallbackUrl } from "@/lib/sign-in-links";
import {
  completeEmailSignIn,
  safeNext,
  signInWithInvite,
} from "@/lib/sign-in.server";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The entry as typed — a name too, on a bare invite link — and how it went. */
export type MagicLinkState = RequestFormState & { ok?: boolean };

/**
 * Send a magic-link email. When `inviteToken` is present the callback will
 * redeem that invite on first sign-in; otherwise the callback provisions the
 * profile (admins only — invited members must use their link). Only the
 * invite case needs the privacy agreement, since that's someone joining
 * (Step 30.4), and a name, read as the request forms read it: a new account
 * keeps it (`options.data`), to name the profile the invite makes and search
 * the tree for as onboarding opens (Step 30.7). `next` is where the sign-in
 * lands: the page proxy.ts sent them here from (Step 30.1).
 */
export async function requestMagicLink(
  _prev: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const inviteToken = String(formData.get("inviteToken") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? ""));
  const consent = formData.get("consent");
  const asksName = signInAsksName(inviteToken);
  const { entered, problem } = readNameAndEmail(formData);
  const email = entered.email;
  // What goes back to the form beside an error, to show again.
  const typed: MagicLinkState = asksName ? entered : { email };

  if (asksName && problem) return problemState(problem, entered);
  if (!asksName && !EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address.", email };
  }

  if (signInNeedsConsent(inviteToken) && consent !== "on" && consent !== "true") {
    return {
      error: "Please accept the privacy notice to continue.",
      ...typed,
    };
  }

  // The magic-link template builds on this address (`{{ .RedirectTo }}`),
  // so `next` rides along to /auth/confirm and on to `confirmSignIn`.
  const callback = signInCallbackUrl(getSiteUrl(), { next, invite: inviteToken });

  const name: JoiningName | undefined = asksName
    ? { first_name: entered.firstName, last_name: entered.lastName }
    : undefined;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callback,
      shouldCreateUser: true,
      data: name,
    },
  });

  if (error) {
    return { error: "Could not send the sign-in link. Try again shortly.", ...typed };
  }

  return { ok: true, ...typed };
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
 * went to and join the tree — no second email — landing on their own entry
 * when a claim invite claimed it (Step 30.2), else on onboarding. Bare links
 * (no recipient) go through `requestMagicLink` instead.
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
  if (result.ok) redirect(result.next);

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

/**
 * Sign out, landing home, or wherever the form's `next` says: "Use another
 * email" on /join goes back to its sign-in form (Step 30.8).
 */
export async function signOut(formData?: FormData) {
  const next = sameOriginPath(String(formData?.get("next") ?? ""));
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(next ?? "/");
}
