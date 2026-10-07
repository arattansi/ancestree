import { BLOG_BODY_MAX, BLOG_TITLE_MAX } from "@/lib/limits";

/**
 * The blog (Step 134): posts at /library (Step 135; /blog before), headed
 * "stories-of-our-wise", each at /library/<slug>. A beta reviewer writes one in Markdown on the admin
 * page's blog tab, as a draft until it's published. Pure, for the admin
 * tab, the blog's pages and their tests.
 */

/** The blog's name, as its heading and its page title say it. */
export const BLOG_NAME = "stories-of-our-wise";

/** A post as a reviewer sees it on the admin page. */
export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  /** Markdown. */
  body: string;
  /** When it was published, or `null` for a draft. */
  publishedAt: string | null;
  updatedAt: string;
};

/** The blog's own page. */
export function blogHref(): string {
  return "/library";
}

/** A post's page: a published one for anyone, a draft for a reviewer. */
export function blogPostHref(slug: string): string {
  return `/library/${encodeURIComponent(slug)}`;
}

/** A post's slug, as the database makes them: words of letters and digits, dashed. */
export function isBlogSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

export type BlogPostFields =
  | { ok: true; title: string; body: string }
  | { ok: false; error: string };

/** A post's title and text, as typed, checked and trimmed. */
export function readBlogPostFields(title: unknown, body: unknown): BlogPostFields {
  const t = typeof title === "string" ? title.trim().replace(/\s+/g, " ") : "";
  const b = typeof body === "string" ? body.trim() : "";
  if (!t) return { ok: false, error: "Give the post a title." };
  if (t.length > BLOG_TITLE_MAX) {
    return { ok: false, error: `Keep the title under ${BLOG_TITLE_MAX} characters.` };
  }
  if (b.length > BLOG_BODY_MAX) {
    return {
      ok: false,
      error: `Too long by ${(b.length - BLOG_BODY_MAX).toLocaleString("en")} characters.`,
    };
  }
  return { ok: true, title: t, body: b };
}

/**
 * The first words of a post's Markdown as plain text, for the blog's
 * list: headings' marks, emphasis, links' addresses, pictures and code
 * fences taken out, cut at a word within `max` characters, with an
 * ellipsis when there's more.
 */
export function blogExcerpt(body: string, max = 200): string {
  const text = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/gm, "")
    .replace(/^\s{0,3}([-*_])(\s*\1){2,}\s*$/gm, " ")
    .replace(/[*_~`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > 0 ? cut.slice(0, atWord) : cut.slice(0, max)).replace(/[,;:.!?]+$/, "")}…`;
}
