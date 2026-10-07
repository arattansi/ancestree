import { BLOG_NAME, blogExcerpt, type BlogPost } from "@/lib/blog";
import { escapeHtml } from "@/lib/email";
import { oneLine, renderEmail } from "@/lib/emails/shared";

/**
 * The library's emails (Step 135): one to confirm a subscription, and one
 * for each post as it's published. Each is built from our own addresses
 * and the post's own words, escaped.
 */

export function libraryConfirmEmail(input: { confirmUrl: string }): {
  subject: string;
  html: string;
} {
  const html = renderEmail({
    title: `${BLOG_NAME} · ancestree`,
    preheader: "One click and you’re subscribed.",
    heading: "Confirm your subscription",
    bodyHtml: `You asked for ${escapeHtml(BLOG_NAME)}, the library on ancestree: a story of someone who has passed, whenever one is published. Confirm it’s you and we’ll send them.`,
    cta: { label: "subscribe", url: input.confirmUrl },
    footnoteHtml:
      "If you didn’t ask for this, ignore it: nothing is sent until you confirm.",
  });
  return { subject: oneLine(`Confirm your subscription to ${BLOG_NAME}`), html };
}

export function libraryPostEmail(input: {
  post: Pick<BlogPost, "title" | "body">;
  postUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string } {
  const excerpt = blogExcerpt(input.post.body, 400);
  const html = renderEmail({
    title: `${escapeHtml(input.post.title)} · ${BLOG_NAME}`,
    preheader: escapeHtml(blogExcerpt(input.post.body, 120)),
    heading: escapeHtml(input.post.title),
    bodyHtml: excerpt ? escapeHtml(excerpt) : undefined,
    cta: { label: "read the story", url: input.postUrl },
    footnoteHtml: `You get a story from ${escapeHtml(BLOG_NAME)} whenever one is published. <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#737373;">Unsubscribe</a>.`,
  });
  return { subject: oneLine(`${input.post.title} · ${BLOG_NAME}`), html };
}
