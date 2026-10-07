import type { Metadata } from "next";
import Link from "next/link";

import {
  MarketingColumn,
  MarketingCopy,
} from "@/components/marketing/marketing-column";
import { BLOG_NAME, blogExcerpt, blogPostHref } from "@/lib/blog";
import { listPublishedPosts } from "@/lib/blog.server";
import { shortDate } from "@/lib/short-date";

export const metadata: Metadata = {
  title: BLOG_NAME,
  description: "Stories from the families growing their trees on ancestree.",
};

/**
 * /blog, "stories-of-our-wise" (Step 134): the published posts, newest
 * first, in the marketing pages' column and type, each its title, its
 * date and its first words. A reviewer writes them on the admin page.
 */
export default async function BlogPage() {
  const posts = await listPublishedPosts();

  return (
    <MarketingColumn>
      <h1 className="text-2xl font-semibold tracking-tight">({BLOG_NAME})</h1>
      {posts.length === 0 ? (
        <MarketingCopy>
          <p>nothing here yet.</p>
        </MarketingCopy>
      ) : (
        <div className="flex flex-col gap-8">
          {posts.map((p) => (
            <article key={p.id} className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold tracking-tight">
                <Link
                  href={blogPostHref(p.slug)}
                  className="underline-offset-4 hover:underline"
                >
                  {p.title}
                </Link>
              </h2>
              <p className="text-xs text-muted-foreground">
                {shortDate(p.publishedAt ?? p.updatedAt)}
              </p>
              {p.body ? (
                <p className="text-sm text-muted-foreground">{blogExcerpt(p.body)}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </MarketingColumn>
  );
}
