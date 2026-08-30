"use server";

import { redirect } from "next/navigation";

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

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
