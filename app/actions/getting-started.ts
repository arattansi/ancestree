"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser, requireProfile } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { isOnboardingKind, type OnboardingKind } from "@/lib/onboarding";
import { previewOnboardingEmail } from "@/lib/onboarding.server";
import { setGettingStartedByToken } from "@/lib/onboarding-settings.server";
import { createClient } from "@/lib/supabase/server";
import { gettingStartedPageHref } from "@/lib/tree-links";
import { isBetaReviewer } from "@/lib/tree-requests.server";

/**
 * Member: whether they get the getting started emails (Step 151), the box
 * in settings. On unless they untick it; the newsletter has its own.
 */
export async function setGettingStartedEmails(on: boolean): Promise<{ error?: string }> {
  await requireProfile();
  if (typeof on !== "boolean") return { error: "Couldn't save that. Try again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_onboarding_emails", { p_on: on });
  if (error) return { error: "Couldn't save that. Try again." };
  revalidatePath("/account");
  return {};
}

/**
 * Anyone holding a member's getting started link (Step 151): turn those
 * emails off, or back on, signed out. The page's buttons post here, so a
 * mail scanner opening the link changes nothing.
 */
export async function setGettingStartedFromLink(
  token: string,
  on: boolean,
): Promise<void> {
  if (typeof on !== "boolean") return;
  await setGettingStartedByToken(token, on);
  revalidatePath(gettingStartedPageHref(token));
}

/**
 * Beta reviewer: one of the getting started emails as it would go to them
 * now (Step 151), for the admin page's preview. Null when they're out of
 * the drip themselves.
 */
export async function previewGettingStartedEmail(
  kind: OnboardingKind,
): Promise<{ error?: string; subject?: string; html?: string | null }> {
  const profile = await requireProfile();
  if (!isOnboardingKind(kind)) return { error: "Not one of the emails." };
  if (!(await isBetaReviewer())) return { error: "Only beta reviewers can do that." };
  const email = await previewOnboardingEmail(profile.auth_user_id, kind);
  return email ? { subject: email.subject, html: email.html } : { html: null };
}

/**
 * Beta reviewer: that email, sent to them now (Step 151). It isn't noted,
 * so their own drip goes on as before.
 */
export async function emailMeAGettingStartedTest(
  kind: OnboardingKind,
): Promise<{ error?: string; sent?: boolean }> {
  const profile = await requireProfile();
  if (!isOnboardingKind(kind)) return { error: "Not one of the emails." };
  const [reviewer, user] = await Promise.all([isBetaReviewer(), getSessionUser()]);
  if (!reviewer || !user?.email) return { error: "Only beta reviewers can do that." };
  const email = await previewOnboardingEmail(profile.auth_user_id, kind);
  if (!email) return { sent: false };
  const result = await sendEmail({
    ...email,
    to: user.email,
    subject: `Test: ${email.subject}`,
  });
  if (!result.ok) return { error: "Couldn't send it. Try again." };
  return { sent: true };
}
