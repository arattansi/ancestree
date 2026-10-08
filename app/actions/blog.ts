"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { blogHref, blogPostHref, readBlogPostFields } from "@/lib/blog";
import { toPost } from "@/lib/blog.server";
import { announcePost } from "@/lib/library-subscribers.server";
import { BLOG_COVER_MAX_MB } from "@/lib/limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isBetaReviewer } from "@/lib/tree-requests.server";

export type BlogActionResult = { error?: string };

const NOT_REVIEWER = "Only a beta reviewer can write the library.";

const COVER_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** The admin page, the library's list, and a post's own page, drawn again. */
function revalidateBlog(slug?: string | null) {
  revalidatePath("/admin");
  revalidatePath(blogHref());
  if (slug) revalidatePath(blogPostHref(slug));
}

/** A cover file in the `library` bucket, gone, once its row no longer points at it. */
function removeCoverLater(path: string | null | undefined) {
  if (!path) return;
  after(async () => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("blog_posts")
      .select("id")
      .eq("cover_path", path)
      .limit(1);
    if (data?.length) return;
    const { error } = await admin.storage.from("library").remove([path]);
    if (error) console.error("[library] cover not removed", error.message);
  });
}

/**
 * Reviewer: a post saved (Step 134, Step 135): a new draft when there's no
 * `id`, else the post's title, text, kind, people and meta title and
 * description, and its cover photo
 * put on, replaced or taken off. The browser has already shrunk the photo;
 * it's stored with the service role under the post's own folder in the
 * public `library` bucket. Each function checks the reviewer again.
 */
export async function saveBlogPost(formData: FormData): Promise<BlogActionResult> {
  if (!(await isBetaReviewer())) return { error: NOT_REVIEWER };

  let people: unknown = [];
  try {
    people = JSON.parse(String(formData.get("people") ?? "[]"));
  } catch {
    people = [];
  }
  const fields = readBlogPostFields(
    formData.get("title"),
    formData.get("body"),
    formData.get("kind"),
    people,
    formData.get("metaTitle"),
    formData.get("metaDescription"),
  );
  if (!fields.ok) return { error: fields.error };

  const cover = formData.get("cover");
  const coverFile = cover instanceof File && cover.size > 0 ? cover : null;
  const removeCover = formData.get("removeCover") === "1";
  if (coverFile) {
    if (!COVER_TYPES[coverFile.type]) return { error: "The cover must be a JPEG, PNG or WebP." };
    if (coverFile.size > BLOG_COVER_MAX_MB * 1024 * 1024) {
      return { error: `Keep the cover under ${BLOG_COVER_MAX_MB} MB.` };
    }
  }

  const supabase = await createClient();
  const id = formData.get("id");
  const saved =
    typeof id === "string" && id
      ? await supabase.rpc("update_blog_post", {
          p_id: id,
          p_title: fields.title,
          p_body: fields.body,
          p_kind: fields.kind,
          p_people: fields.people,
          p_meta_title: fields.metaTitle,
          p_meta_description: fields.metaDescription,
        })
      : await supabase.rpc("create_blog_post", {
          p_title: fields.title,
          p_body: fields.body,
          p_kind: fields.kind,
          p_people: fields.people,
          p_meta_title: fields.metaTitle,
          p_meta_description: fields.metaDescription,
        });
  if (saved.error || !saved.data) return { error: "Could not save the post. Try again." };
  const post = toPost(saved.data);

  if (coverFile || removeCover) {
    let path: string | null = null;
    if (coverFile) {
      path = `${post.id}/${randomUUID()}.${COVER_TYPES[coverFile.type]}`;
      const { error } = await createAdminClient()
        .storage.from("library")
        .upload(path, coverFile, { contentType: coverFile.type, upsert: false });
      if (error) {
        revalidateBlog(post.slug);
        return { error: "The post is saved, but its cover didn’t upload. Try again." };
      }
    }
    const { data: old, error } = await supabase.rpc("set_blog_post_cover", {
      p_id: post.id,
      p_path: path ?? "",
    });
    if (error) {
      removeCoverLater(path);
      revalidateBlog(post.slug);
      return { error: "The post is saved, but its cover didn’t. Try again." };
    }
    removeCoverLater(old);
  }

  revalidateBlog(post.slug);
  return {};
}

/**
 * Reviewer: publish a draft, or take a post back to a draft. The first
 * time a post is published, every confirmed subscriber is emailed it
 * once the page has answered.
 */
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
  if (error || !data) {
    return {
      error: published
        ? "Could not publish the post. Try again."
        : "Could not unpublish the post. Try again.",
    };
  }
  const post = toPost(data);
  if (published && data.announced_at === null) {
    after(() => announcePost(post));
  }
  revalidateBlog(post.slug);
  return {};
}

/** Reviewer: delete a post, draft or published, and its cover's file. */
export async function deleteBlogPost(id: string, slug: string): Promise<BlogActionResult> {
  if (!(await isBetaReviewer())) return { error: NOT_REVIEWER };
  const supabase = await createClient();
  const { data: row } = await createAdminClient()
    .from("blog_posts")
    .select("cover_path")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.rpc("delete_blog_post", { p_id: id });
  if (error) return { error: "Could not delete the post. Try again." };
  removeCoverLater(row?.cover_path);
  revalidateBlog(slug);
  return {};
}
