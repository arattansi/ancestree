"use server";

import { revalidatePath } from "next/cache";

import { blogSubscriptionHref } from "@/lib/blog";
import { isEmailAddress, MAX_EMAIL_LENGTH } from "@/lib/email-address";
import { subscribeToLibrary, unsubscribe } from "@/lib/library-subscribers.server";

export type SubscribeState = { ok?: boolean; error?: string; email?: string };

/**
 * A visitor subscribing to the library (Step 135): their address gets
 * the confirm email, and the page says to look for it whatever the list
 * held, so nothing here tells anyone whether an address is on it.
 */
export async function subscribeToStories(
  _prev: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || !isEmailAddress(email)) {
    return { error: "Enter an email address.", email };
  }
  await subscribeToLibrary(email);
  return { ok: true, email };
}

/** The Unsubscribe link's page, its button pressed. */
export async function unsubscribeFromStories(token: string): Promise<void> {
  await unsubscribe(token);
  revalidatePath(blogSubscriptionHref(token));
}
