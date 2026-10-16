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

/**
 * The copy of a story sent in (Step 157), emailed to the address typed:
 * what was sent, word for word and escaped (its paragraphs kept, nothing
 * read as Markdown or HTML), with the button to ask for a change. The
 * address may not be the sender's own, so the small print says how to have
 * it taken down.
 */
export function librarySubmissionEmail(input: {
  title: string;
  body: string;
  /** Who it's about, named in full. */
  who: string;
  withPhoto: boolean;
  copyUrl: string;
}): { subject: string; html: string } {
  const paragraphs = input.body
    .trim()
    .split(/\r?\n[ \t]*\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#404040;">${escapeHtml(p).replace(/\r?\n/g, "<br />")}</p>`,
    )
    .join("");
  const details = [input.who ? `About ${escapeHtml(input.who)}` : "", input.withPhoto ? "with a photo" : ""]
    .filter(Boolean)
    .join(", ");
  const contentHtml = `
                <div style="margin:20px 0 0;padding:4px 0 4px 16px;border-left:3px solid #e5e5e5;">
                  <p style="margin:0;font-size:15px;font-weight:600;color:#0a0a0a;">${escapeHtml(oneLine(input.title))}</p>${
                    details
                      ? `
                  <p style="margin:4px 0 0;font-size:13px;color:#737373;">${details}</p>`
                      : ""
                  }${paragraphs}
                </div>`;
  const html = renderEmail({
    title: `Your story · ${BLOG_NAME}`,
    preheader: escapeHtml(oneLine(`Your copy of “${input.title}”.`)),
    heading: "We have your story",
    bodyHtml: `Thank you. Here&rsquo;s what you sent to ${escapeHtml(BLOG_NAME)}; we&rsquo;ll edit it to fit the library before it&rsquo;s published.`,
    contentHtml,
    cta: { label: "ask for a change", url: input.copyUrl },
    footnoteHtml:
      "If you didn&rsquo;t send this, ask for a change and say so, and we&rsquo;ll delete it.",
  });
  return { subject: oneLine(`Your story for ${BLOG_NAME}: ${input.title}`), html };
}
