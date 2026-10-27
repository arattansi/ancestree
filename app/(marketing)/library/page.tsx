import type { Metadata } from "next";

import { LibraryCard } from "@/components/library/library-card";
import { SendStoryLink } from "@/components/library/send-story-link";
import { SubscribeForm } from "@/components/library/subscribe-form";
import {
  MarketingColumn,
  MarketingCopy,
} from "@/components/marketing/marketing-column";
import { BLOG_NAME, blogFeedHref } from "@/lib/blog";
import { listPublishedPosts } from "@/lib/blog.server";
import { marketingMetadata } from "@/lib/marketing-meta";

export const metadata: Metadata = {
  ...marketingMetadata(
    "ancestree • library",
    "collection of stories to remember.",
  ),
  alternates: {
    types: { "application/rss+xml": blogFeedHref() },
  },
};

/**
 * /library, "stories-of-our-wise" (Step 134 as /blog; Step 135): the
 * published posts, newest first, each drawn as the leaves of the people
 * it profiles (`LibraryCard`), and a way to subscribe, by email or RSS.
 * A reviewer writes the posts on the admin page; since Step 157 anyone may
 * send a story in for them (`/library/submit`). The proverb and the way to
 * send one in sit under the heading on a phone; from `lg` they float on
 * the right of the screen, level with the menu held open on the left
 * (Step 158).
 */
export default async function LibraryPage() {
  const posts = await listPublishedPosts();

  return (
    <MarketingColumn>
      <h1 className="text-2xl font-semibold tracking-tight">({BLOG_NAME})</h1>
      <div className="flex flex-col gap-6 lg:fixed lg:top-1/2 lg:right-14 lg:w-60 lg:-translate-y-1/2">
        <MarketingCopy>
          <p>
            when an elder dies, it is as if a library burned to the ground.
          </p>
          <p>– African proverb</p>
        </MarketingCopy>
        <SendStoryLink>Submit a story for this library</SendStoryLink>
      </div>
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
