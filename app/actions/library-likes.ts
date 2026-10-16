"use server";

import { setLike, type Likes } from "@/lib/library-likes.server";

/**
 * A reader likes a post, or takes their like back (Step 157). Signed out
 * is fine: the like is the reader cookie's. Answers the post's likes
 * after, which the button shows.
 */
export async function setPostLike(
  postId: string,
  liked: boolean,
): Promise<Likes | { error: string }> {
  const likes = await setLike(postId, liked === true);
  return likes ?? { error: "Could not like it. Try again." };
}
