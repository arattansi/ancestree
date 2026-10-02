"use server";

import { revalidatePath } from "next/cache";

import { adminPageHref } from "@/lib/admin-page";
import { getSessionUser, requireProfile } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { setNewsletterByToken } from "@/lib/newsletter-settings.server";
import { ownNewsletter } from "@/lib/newsletter.server";
import { createClient } from "@/lib/supabase/server";
import { byJoined, listMyTrees } from "@/lib/tree-context";
import { newsletterPageHref } from "@/lib/tree-links";
import { isBetaReviewer } from "@/lib/tree-requests.server";

/**
 * Member: whether they get the weekly newsletter (Step 95), the box in
 * settings. On unless they untick it.
 */
export async function setWeeklyNewsletter(on: boolean): Promise<{ error?: string }> {
  await requireProfile();
  if (typeof on !== "boolean") return { error: "Couldn't save that. Try again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_newsletter", { p_on: on });
  if (error) return { error: "Couldn't save that. Try again." };
  revalidatePath("/account");
  return {};
}

/**
 * Anyone holding a member's unsubscribe link (Step 95): turn their weekly
 * newsletter off, or back on, signed out. The token is the link's secret;
 * the page's buttons post here, so a mail scanner opening the link
 * changes nothing.
 */
export async function setNewsletterFromLink(
  token: string,
  on: boolean,
): Promise<void> {
  if (typeof on !== "boolean") return;
  await setNewsletterByToken(token, on);
  revalidatePath(newsletterPageHref(token));
}

/**
 * Beta reviewer: when the weekly newsletter goes out (Step 95), from the
 * admin page's newsletter tab — the day, and whether it's paused for
 * everyone. The database refuses anyone else (`set_newsletter_schedule`).
 */
export async function setNewsletterSchedule(
  weekday: number,
  paused: boolean,
): Promise<{ error?: string }> {
  await requireProfile();
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || typeof paused !== "boolean") {
    return { error: "Couldn't save that. Try again." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_newsletter_schedule", {
    p_weekday: weekday,
    p_paused: paused,
  });
  if (error) return { error: "Couldn't save that. Try again." };
  revalidatePath(adminPageHref());
  return {};
}

/**
 * Beta reviewer: their own issue as the next send would make it, emailed
 * to them now (Step 95). It doesn't count as their week's, so the real one
 * still comes.
 */
export async function emailMeANewsletterTest(): Promise<{
  error?: string;
  sent?: boolean;
}> {
  const profile = await requireProfile();
  const [reviewer, user, trees] = await Promise.all([
    isBetaReviewer(),
    getSessionUser(),
    listMyTrees(),
  ]);
  if (!reviewer || !user?.email) return { error: "Only beta reviewers can do that." };
  const email = await ownNewsletter(
    {
      userId: profile.auth_user_id,
      email: user.email,
      selfPersonId: profile.self_person_id,
      treeIds: byJoined(trees).map((t) => t.id),
    },
    { sending: true },
  );
  if (!email) return { sent: false };
  const result = await sendEmail({ ...email, subject: `Test: ${email.subject}` });
  if (!result.ok) return { error: "Couldn't send it. Try again." };
  return { sent: true };
}
