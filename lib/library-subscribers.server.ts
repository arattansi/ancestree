import "server-only";

import {
  blogOneClickUnsubscribeHref,
  blogPostHref,
  blogSubscriptionHref,
  type BlogPost,
} from "@/lib/blog";
import { sendEmail, sendEmails, unsentSummary } from "@/lib/email";
import { libraryConfirmEmail, libraryPostEmail } from "@/lib/emails/library";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The library's subscribers (Step 135): a row per address with a secret
 * token, confirmed by the link in the first email, unsubscribed by the
 * link in every post's. Service role only, and nothing here says whether
 * an address is on the list: a visitor who subscribes is told to check
 * their email whatever the row held.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Subscription = {
  confirmed: boolean;
  unsubscribed: boolean;
};

/**
 * Subscribe `email`: a row if there's none, and the confirm email, unless
 * they're already confirmed and still on the list (then nothing: a second
 * ask from them, or from someone else with their address, changes
 * nothing and sends nothing). Someone who unsubscribed and asks again is
 * asked to confirm again.
 */
export async function subscribeToLibrary(email: string): Promise<void> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("library_subscribers")
    .select("id, token, confirmed_at, unsubscribed_at")
    .ilike("email", email)
    .maybeSingle();

  let token: string;
  if (existing) {
    if (existing.confirmed_at && !existing.unsubscribed_at) return;
    token = existing.token;
  } else {
    const { data, error } = await admin
      .from("library_subscribers")
      .insert({ email })
      .select("token")
      .single();
    if (error || !data) {
      // A race with themselves (the unique index): their first ask sends it.
      if (error?.code === "23505") return;
      console.error("[library] could not add a subscriber", error?.message);
      return;
    }
    token = data.token;
  }

  const { subject, html } = libraryConfirmEmail({
    confirmUrl: `${getSiteUrl()}${blogSubscriptionHref(token, true)}`,
  });
  const sent = await sendEmail({ to: email, subject, html });
  if (!sent.ok) console.error("[library] confirm email not sent", sent.error);
}

/** The subscription the token names, or `null`. */
export async function readSubscription(token: string): Promise<Subscription | null> {
  if (!UUID.test(token)) return null;
  const { data } = await createAdminClient()
    .from("library_subscribers")
    .select("confirmed_at, unsubscribed_at")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  return { confirmed: data.confirmed_at !== null, unsubscribed: data.unsubscribed_at !== null };
}

/** Confirm the subscription the token names (and put it back on the list). */
export async function confirmSubscription(token: string): Promise<Subscription | null> {
  if (!UUID.test(token)) return null;
  const now = new Date().toISOString();
  const { data } = await createAdminClient()
    .from("library_subscribers")
    .update({ confirmed_at: now, unsubscribed_at: null, updated_at: now })
    .eq("token", token)
    .select("confirmed_at, unsubscribed_at")
    .maybeSingle();
  if (!data) return null;
  return { confirmed: true, unsubscribed: false };
}

/** Take the subscription the token names off the list. Says nothing about whether it existed. */
export async function unsubscribe(token: string): Promise<void> {
  if (!UUID.test(token)) return;
  const now = new Date().toISOString();
  await createAdminClient()
    .from("library_subscribers")
    .update({ unsubscribed_at: now, updated_at: now })
    .eq("token", token)
    .is("unsubscribed_at", null);
}

/**
 * A post published for the first time, sent to every confirmed
 * subscriber still on the list. `announced_at` is claimed first, so a
 * post published, unpublished and published again is sent once.
 */
export async function announcePost(post: Pick<BlogPost, "id" | "slug" | "title" | "body">) {
  const admin = createAdminClient();
  const { data: claimed } = await admin
    .from("blog_posts")
    .update({ announced_at: new Date().toISOString() })
    .eq("id", post.id)
    .is("announced_at", null)
    .not("published_at", "is", null)
    .select("id");
  if (!claimed?.length) return;

  const { data: subscribers } = await admin
    .from("library_subscribers")
    .select("email, token")
    .not("confirmed_at", "is", null)
    .is("unsubscribed_at", null);
  if (!subscribers?.length) return;

  const site = getSiteUrl();
  const postUrl = `${site}${blogPostHref(post.slug)}`;
  const results = await sendEmails(
    subscribers.map((s) => {
      const { subject, html } = libraryPostEmail({
        post,
        postUrl,
        unsubscribeUrl: `${site}${blogSubscriptionHref(s.token)}`,
      });
      return {
        to: s.email,
        subject,
        html,
        headers: {
          "List-Unsubscribe": `<${site}${blogOneClickUnsubscribeHref(s.token)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
    }),
  );
  const unsent = unsentSummary(results);
  if (unsent) console.error("[library] post emails", unsent);
}
