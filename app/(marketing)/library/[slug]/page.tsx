import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PostArticle } from "@/components/library/post-article";
import { SubscribeForm } from "@/components/library/subscribe-form";
import { MarketingColumn } from "@/components/marketing/marketing-column";
import { BLOG_NAME, blogExcerpt, blogHref, coverPhotoUrl } from "@/lib/blog";
import { findBlogPost } from "@/lib/blog.server";
import { shortDate } from "@/lib/short-date";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await findBlogPost(slug);
  if (!post) return { title: BLOG_NAME };
  const cover = coverPhotoUrl(post.coverPath);
  return {
    title: post.title,
    description: post.body ? blogExcerpt(post.body, 160) : undefined,
    openGraph: cover ? { images: [{ url: cover }] } : undefined,
  };
}

/**
 * One post (Step 134, Step 135): its cover, title, date and Markdown, the
 * ancestree mark between its paragraphs, under a link back to the
 * library. A published post is anyone's to read; a draft only opens for a
 * reviewer, who sees it marked as one, and is nowhere for anyone else.
 */
export default async function LibraryPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await findBlogPost(slug);
  if (!post) notFound();

  return (
    <MarketingColumn>
      <Link
        href={blogHref()}
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ({BLOG_NAME})
      </Link>
      <PostArticle
        title={post.title}
        dateLine={
          post.publishedAt ? shortDate(post.publishedAt) : `saved ${shortDate(post.updatedAt)}`
        }
        draft={!post.publishedAt}
        coverUrl={coverPhotoUrl(post.coverPath)}
        body={post.body}
      />
      <SubscribeForm />
    </MarketingColumn>
  );
}
