"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { setNewsletterByToken } from "@/lib/newsletter-settings.server";
import { createClient } from "@/lib/supabase/server";
import { newsletterPageHref } from "@/lib/tree-links";

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
