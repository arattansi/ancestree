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
import {
  isWholeSignInCode,
  readSignInCode,
  sendCodeRefusal,
  SIGN_IN_CODE_LENGTH,
  signInCodeRefusal,
} from "@/lib/sign-in-code";
import { signInCallbackUrl } from "@/lib/sign-in-links";
import {
  completeCodeSignIn,
  completeEmailSignIn,
  emailInviteSignInCode,
  safeNext,
  signInWithInvite,
} from "@/lib/sign-in.server";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The entry as typed — a name too, on a bare invite link — and how it went.
 * Once a code is on its way, `sentAt` tells one sending from the next, and a
 * second send ("Send a new code") says how it went in `resent` or
 * `resendError` without leaving the code box.
 */
export type MagicLinkState = RequestFormState & {
  ok?: boolean;
  sentAt?: number;
  resent?: boolean;
  resendError?: string;
};

/**
 * Email a sign-in code (a link until Step 53). When `inviteToken` is present
 * entering the code redeems that invite; otherwise it provisions the profile
 * (admins only — invited members must use their link). Only the invite case
 * needs the privacy agreement, since that's someone joining (Step 30.4), and
 * a name, read as the request forms read it: a new account keeps it
 * (`options.data`), to name the profile the invite makes and search the tree
 * for as onboarding opens (Step 30.7). `next` is where the sign-in lands:
 * the page proxy.ts sent them here from (Step 30.1). `resend` is the code
 * box asking again, with everything the first send had.
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
  const resend = formData.get("resend") === "1";

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

  // Only a stock template would link anywhere; ours carries the code alone,
  // and the code box keeps `next` and the invite itself.
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
    // Asked again from the code box: stay on it, the first code still good.
    if (resend) {
      const sentAt = Number(formData.get("sentAt")) || Date.now();
      return { ok: true, ...typed, sentAt, resendError: sendCodeRefusal(error.code) };
    }
    return { error: sendCodeRefusal(error.code), ...typed };
  }

  return { ok: true, ...typed, sentAt: Date.now(), resent: resend };
}

export type SignInCodeState = { error?: string };

/**
 * The code box (Step 53): check the emailed code for that address and go
 * where the email's link would have — the invite it was sent for redeemed
 * (`inviteToken`), else `next`. It sends itself once the code is whole.
 */
export async function verifySignInCode(
  _prev: SignInCodeState,
  formData: FormData,
): Promise<SignInCodeState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = readSignInCode(String(formData.get("code") ?? ""));
  const invite = String(formData.get("inviteToken") ?? "").trim() || null;
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!EMAIL_RE.test(email) || !isWholeSignInCode(code)) {
    return { error: `Enter the ${SIGN_IN_CODE_LENGTH}-digit code from the email.` };
  }

  const result = await completeCodeSignIn({ email, code, invite, next });
  if (!result.ok) return { error: signInCodeRefusal(result.errorCode) };
  redirect(result.next);
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
  /**
   * The address already has an account: offer to email it a sign-in code
   * (`sendInviteSignInCode`, Step 30.8).
   */
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

export type InviteSignInCodeState = {
  error?: string;
  /** The invite's address, once the code is on its way. */
  sentTo?: string;
  /** As `MagicLinkState`'s: one sending from the next, and a second send. */
  sentAt?: number;
  resent?: boolean;
  resendError?: string;
};

/**
 * The invite page's answer for an address that already has an account —
 * at once for someone signed out (Step 41.2), or once `acceptInvite` finds
 * it (Step 30.8): email it a sign-in code, which accepts the invite once
 * entered on the page (Step 53). It goes to the address the invite names,
 * never one typed here (`emailInviteSignInCode`).
 */
export async function sendInviteSignInCode(
  _prev: InviteSignInCodeState,
  formData: FormData,
): Promise<InviteSignInCodeState> {
  const token = String(formData.get("inviteToken") ?? "").trim();
  const resend = formData.get("resend") === "1";
  const result = await emailInviteSignInCode(token);
  if (result.ok) return { sentTo: result.email, sentAt: Date.now(), resent: resend };
  if (result.reason === "invalid") {
    return {
      error:
        "This invite is no longer valid. Ask the relative who invited you for a fresh one.",
    };
  }
  if (resend) {
    return {
      sentTo: String(formData.get("sentTo") ?? ""),
      sentAt: Number(formData.get("sentAt")) || Date.now(),
      resendError: sendCodeRefusal(result.errorCode),
    };
  }
  return { error: sendCodeRefusal(result.errorCode) };
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
