import type { Metadata } from "next";

import { LibraryCard } from "@/components/library/library-card";
import { SubscribeForm } from "@/components/library/subscribe-form";
import {
  MarketingColumn,
  MarketingCopy,
} from "@/components/marketing/marketing-column";
import { BLOG_NAME, blogFeedHref } from "@/lib/blog";
import { listPublishedPosts } from "@/lib/blog.server";

export const metadata: Metadata = {
  title: BLOG_NAME,
  description: "Stories of our wise: the people our families came from, on ancestree.",
  alternates: {
    types: { "application/rss+xml": blogFeedHref() },
  },
};

/**
 * /library, "stories-of-our-wise" (Step 134 as /blog; Step 135): the
 * published posts, newest first, each drawn as the leaves of the people
 * it profiles (`LibraryCard`), and a way to subscribe, by email or RSS.
 * A reviewer writes the posts on the admin page.
 */
export default async function LibraryPage() {
  const posts = await listPublishedPosts();

  return (
    <MarketingColumn>
      <h1 className="text-2xl font-semibold tracking-tight">({BLOG_NAME})</h1>
      <MarketingCopy>
        <p>the people our families came from, one story at a time.</p>
      </MarketingCopy>
      {posts.length === 0 ? (
        <MarketingCopy>
          <p>nothing here yet.</p>
        </MarketingCopy>
      ) : (
        <div className="flex flex-col gap-6">
          {posts.map((p) => (
            <LibraryCard key={p.id} post={p} />
          ))}
        </div>
      )}
      <SubscribeForm />
    </MarketingColumn>
  );
}
