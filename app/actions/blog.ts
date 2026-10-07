"use server";

import { revalidatePath } from "next/cache";

import { blogHref, blogPostHref, readBlogPostFields } from "@/lib/blog";
import { createClient } from "@/lib/supabase/server";
import { isBetaReviewer } from "@/lib/tree-requests.server";

export type BlogActionResult = { error?: string };

const NOT_REVIEWER = "Only a beta reviewer can write the blog.";

/** The admin page, the blog's list, and a post's own page, drawn again. */
function revalidateBlog(slug?: string | null) {
  revalidatePath("/admin");
  revalidatePath(blogHref());
  if (slug) revalidatePath(blogPostHref(slug));
}

/**
 * Reviewer: a new draft (Step 134), titled, with its text in Markdown.
 * Its slug is made by the database from the title. Each function checks
 * the reviewer again.
 */
export async function createBlogPost(
  title: string,
  body: string,
): Promise<BlogActionResult> {
  if (!(await isBetaReviewer())) return { error: NOT_REVIEWER };
  const fields = readBlogPostFields(title, body);
  if (!fields.ok) return { error: fields.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_blog_post", {
    p_title: fields.title,
    p_body: fields.body,
  });
  if (error) return { error: "Could not save the draft. Try again." };
  revalidateBlog();
  return {};
}

/** Reviewer: a post's title and text, draft or published. */
export async function updateBlogPost(
  id: string,
  title: string,
  body: string,
): Promise<BlogActionResult> {
  if (!(await isBetaReviewer())) return { error: NOT_REVIEWER };
  const fields = readBlogPostFields(title, body);
  if (!fields.ok) return { error: fields.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_blog_post", {
    p_id: id,
    p_title: fields.title,
    p_body: fields.body,
  });
  if (error) return { error: "Could not save the post. Try again." };
  revalidateBlog(data?.slug);
  return {};
}

/** Reviewer: publish a draft, or take a post back to a draft. */
export async function setBlogPostPublished(
  id: string,
  published: boolean,
): Promise<BlogActionResult> {
  if (!(await isBetaReviewer())) return { error: NOT_REVIEWER };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_blog_post_published", {
    p_id: id,
    p_published: published,
  });
  if (error) {
    return {
      error: published
        ? "Could not publish the post. Try again."
        : "Could not unpublish the post. Try again.",
    };
  }
  revalidateBlog(data?.slug);
  return {};
}

/** Reviewer: delete a post, draft or published. */
export async function deleteBlogPost(id: string, slug: string): Promise<BlogActionResult> {
  if (!(await isBetaReviewer())) return { error: NOT_REVIEWER };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_blog_post", { p_id: id });
  if (error) return { error: "Could not delete the post. Try again." };
  revalidateBlog(slug);
  return {};
}
