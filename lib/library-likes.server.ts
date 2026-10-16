import "server-only";

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import { blogHref } from "@/lib/blog";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Likes on the library's posts (Step 157). A reader is whoever holds the
 * `ancestree-reader` cookie, a random id the server sets the first time
 * they like a post, signed in or not; each likes a post once. Only the
 * library's pages are sent it. Service role only.
 */

const READER_COOKIE = "ancestree-reader";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A reader's likes stay theirs for two years, renewed with each like. */
const READER_MAX_AGE = 60 * 60 * 24 * 365 * 2;

export type Likes = { likes: number; liked: boolean };

async function readerId(): Promise<string | null> {
  const id = (await cookies()).get(READER_COOKIE)?.value;
  return id && UUID.test(id) ? id : null;
}

/** A post's likes, and whether this reader is one. */
export async function readLikes(postId: string): Promise<Likes> {
  const reader = await readerId();
  const { data } = await createAdminClient().rpc("blog_post_like_count", {
    p_post_id: postId,
    // Nobody's: the count alone.
    p_reader: reader ?? "00000000-0000-0000-0000-000000000000",
  });
  const row = data?.[0];
  return { likes: row?.likes ?? 0, liked: !!reader && !!row?.liked };
}

/**
 * This reader likes a published post, or no longer does; a first like
 * gives them their cookie. Answers the post's likes after, or `null` when
 * there's no such published post. From a server action only.
 */
export async function setLike(postId: string, liked: boolean): Promise<Likes | null> {
  if (!UUID.test(postId)) return null;
  let reader = await readerId();
  if (!reader) {
    if (!liked) return readLikes(postId);
    reader = randomUUID();
  }
  const { data, error } = await createAdminClient().rpc("set_blog_post_like", {
    p_post_id: postId,
    p_reader: reader,
    p_liked: liked,
  });
  if (error || !data?.[0]) return null;
  (await cookies()).set(READER_COOKIE, reader, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: blogHref(),
    maxAge: READER_MAX_AGE,
  });
  return { likes: data[0].likes, liked: data[0].liked };
}
