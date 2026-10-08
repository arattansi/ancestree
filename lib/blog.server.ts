import "server-only";

import { isBlogSlug, readBlogKind, readBlogPeople, type BlogPost } from "@/lib/blog";
import { createClient } from "@/lib/supabase/server";

type PostRow = {
  id: string;
  slug: string;
  title: string;
  body: string;
  kind: string;
  cover_path: string | null;
  people: unknown;
  /** Not answered with the library's list (`published_blog_posts`). */
  meta_title?: string;
  meta_description?: string;
  published_at: string | null;
  updated_at: string;
};

export function toPost(row: PostRow): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    body: row.body,
    kind: readBlogKind(row.kind),
    coverPath: row.cover_path,
    people: readBlogPeople(row.people),
    metaTitle: row.meta_title ?? "",
    metaDescription: row.meta_description ?? "",
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

/** Every post, drafts first, each newest first. Reviewers only. */
export async function listBlogPosts(): Promise<BlogPost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_blog_posts");
  if (error || !data) return [];
  return data.map(toPost);
}

/** The published posts, newest first, for anyone. */
export async function listPublishedPosts(): Promise<BlogPost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("published_blog_posts");
  if (error || !data) return [];
  return data.map(toPost);
}

/**
 * The post at `slug`: a published one for anyone, a draft only for a
 * reviewer (previewing it), `null` otherwise. A slug that can't be one
 * isn't looked up.
 */
export async function findBlogPost(slug: string): Promise<BlogPost | null> {
  if (!isBlogSlug(slug)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("blog_post", { p_slug: slug });
  if (error || !data?.[0]) return null;
  return toPost(data[0]);
}
