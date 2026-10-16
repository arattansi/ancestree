import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LibraryBackLink } from "@/components/library/library-back-link";
import { PostArticle } from "@/components/library/post-article";
import { PostEngagement } from "@/components/library/post-engagement";
import { SendStoryLink } from "@/components/library/send-story-link";
import { SubscribeForm } from "@/components/library/subscribe-form";
import { MarketingColumn } from "@/components/marketing/marketing-column";
import { BLOG_NAME, blogPostHref, blogPostMeta, coverPhotoUrl } from "@/lib/blog";
import { findBlogPost } from "@/lib/blog.server";
import { readLikes } from "@/lib/library-likes.server";
import { shortDate } from "@/lib/short-date";
import { getSiteUrl } from "@/lib/site-url";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await findBlogPost(slug);
  if (!post) return { title: BLOG_NAME };
  const cover = coverPhotoUrl(post.coverPath);
  const { title, description } = blogPostMeta(post);
  return {
    // A meta title is used as written; the post's own title is "… · ancestree".
    title: post.metaTitle ? { absolute: title } : title,
    description: description || undefined,
    openGraph: {
      type: "article",
      siteName: "ancestree",
      title,
      description: description || undefined,
      // Setting openGraph here drops the site's own picture, so it's named.
      images: [{ url: cover ?? "/opengraph-image" }],
    },
  };
}

/**
 * One post (Step 134, Step 135): its cover, title, date and Markdown, the
 * ancestree mark between its paragraphs, under a link back to the
 * library (an arrow pointing back since Step 157). A published post is
 * anyone's to read, and to like and share (Step 157) beside subscribing;
 * a draft only opens for a reviewer, who sees it marked as one, and is
 * nowhere for anyone else.
 */
export default async function LibraryPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await findBlogPost(slug);
  if (!post) notFound();
  const likes = post.publishedAt ? await readLikes(post.id) : null;

  return (
    <MarketingColumn>
      <LibraryBackLink />
      <PostArticle
        title={post.title}
        dateLine={
          post.publishedAt ? shortDate(post.publishedAt) : `saved ${shortDate(post.updatedAt)}`
        }
        draft={!post.publishedAt}
        coverUrl={coverPhotoUrl(post.coverPath)}
        body={post.body}
      />
      {likes ? (
        <div className="border-t pt-6">
          <PostEngagement
            postId={post.id}
            url={`${getSiteUrl()}${blogPostHref(post.slug)}`}
            title={post.title}
            likes={likes}
          />
        </div>
      ) : null}
      <SubscribeForm />
      <SendStoryLink />
    </MarketingColumn>
  );
}
