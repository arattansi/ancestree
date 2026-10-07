import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketingColumn } from "@/components/marketing/marketing-column";
import { StoryMarkdown } from "@/components/story-markdown";
import { Badge } from "@/components/ui/badge";
import { BLOG_NAME, blogExcerpt, blogHref } from "@/lib/blog";
import { findBlogPost } from "@/lib/blog.server";
import { shortDate } from "@/lib/short-date";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await findBlogPost(slug);
  if (!post) return { title: BLOG_NAME };
  return {
    title: post.title,
    description: post.body ? blogExcerpt(post.body, 160) : undefined,
  };
}

/**
 * One post (Step 134): its title, its date and its Markdown, under a link
 * back to the blog. A published post is anyone's to read; a draft only
 * opens for a reviewer, who sees it marked as one, and is nowhere for
 * anyone else.
 */
export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await findBlogPost(slug);
  if (!post) notFound();

  return (
    <MarketingColumn>
      <div className="flex flex-col gap-2">
        <Link
          href={blogHref()}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ({BLOG_NAME})
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{post.title}</h1>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {post.publishedAt ? (
            shortDate(post.publishedAt)
          ) : (
            <>
              <Badge variant="secondary">Draft</Badge>
              <span>saved {shortDate(post.updatedAt)}</span>
            </>
          )}
        </p>
      </div>
      <StoryMarkdown className="text-sm text-muted-foreground">{post.body}</StoryMarkdown>
    </MarketingColumn>
  );
}
