import {
  BLOG_BODY_MAX,
  BLOG_META_DESCRIPTION_MAX,
  BLOG_META_TITLE_MAX,
  BLOG_TITLE_MAX,
} from "@/lib/limits";

/**
 * The library (Step 134 as /blog, /library since Step 135): posts headed
 * "stories-of-our-wise", each at /library/<slug>. A post is a spotlight on
 * people who have passed — one person, a couple or a family — with a cover
 * photo and the people profiled, whose birthplaces pick their leaves. A
 * beta reviewer writes one in Markdown on the admin page's blog tab, as a
 * draft until it's published. Pure, for the admin tab, the library's pages
 * and their tests.
 */

/** The library's name, as its heading and its page title say it. */
export const BLOG_NAME = "stories-of-our-wise";

/** Who a post is about. */
export const BLOG_KINDS = ["person", "couple", "family"] as const;
export type BlogKind = (typeof BLOG_KINDS)[number];

/** How many people one post may profile (`blog_posts_people_check`). */
export const BLOG_PEOPLE_MAX = 12;
/** A profiled person's name parts, and their place of birth. */
export const BLOG_PERSON_NAME_MAX = 80;
export const BLOG_PERSON_PLACE_MAX = 120;

/** One of the people a post profiles. */
export type BlogPerson = {
  first: string;
  last: string;
  /** Empty when there's none. */
  maiden: string;
  /** Their place of birth, which picks their leaf; empty when unknown. */
  place: string;
};

/** A post as a reviewer sees it on the admin page. */
export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  /** Markdown. */
  body: string;
  kind: BlogKind;
  /** The cover photo's path in the `library` bucket, or `null`. */
  coverPath: string | null;
  people: BlogPerson[];
  /** Its title for search engines and link previews; empty for the post's own. */
  metaTitle: string;
  /** Its description for them; empty for the post's first words. */
  metaDescription: string;
  /** When it was published, or `null` for a draft. */
  publishedAt: string | null;
  updatedAt: string;
};

/** The library's own page. */
export function blogHref(): string {
  return "/library";
}

/** A post's page: a published one for anyone, a draft for a reviewer. */
export function blogPostHref(slug: string): string {
  return `/library/${encodeURIComponent(slug)}`;
}

/** The library's RSS feed. */
export function blogFeedHref(): string {
  return `${blogHref()}/feed.xml`;
}

/** Where a subscription's link lands: confirm it, or unsubscribe. */
export function blogSubscriptionHref(token: string, confirm = false): string {
  return `${blogHref()}/subscription/${encodeURIComponent(token)}${confirm ? "?confirm=1" : ""}`;
}

/** The one-click unsubscribe (RFC 8058) address a mail app posts to. */
export function blogOneClickUnsubscribeHref(token: string): string {
  return `/api/library/subscription/${encodeURIComponent(token)}`;
}

/** A post's slug, as the database makes them: words of letters and digits, dashed. */
export function isBlogSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/** A cover photo's public address, from its path in the `library` bucket. */
export function coverPhotoUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/library/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/** `kind` as typed, or "person" for anything else. */
export function readBlogKind(raw: unknown): BlogKind {
  return typeof raw === "string" && (BLOG_KINDS as readonly string[]).includes(raw)
    ? (raw as BlogKind)
    : "person";
}

const text = (v: unknown, max: number) =>
  (typeof v === "string" ? v : "").trim().replace(/\s+/g, " ").slice(0, max);

/**
 * The people profiled, as typed or as stored: each trimmed, anyone with
 * no name at all left out, at most `BLOG_PEOPLE_MAX`. Anything that isn't
 * a list of them is nobody.
 */
export function readBlogPeople(raw: unknown): BlogPerson[] {
  if (!Array.isArray(raw)) return [];
  const people: BlogPerson[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const person: BlogPerson = {
      first: text(p.first, BLOG_PERSON_NAME_MAX),
      last: text(p.last, BLOG_PERSON_NAME_MAX),
      maiden: text(p.maiden, BLOG_PERSON_NAME_MAX),
      place: text(p.place, BLOG_PERSON_PLACE_MAX),
    };
    if (!person.first && !person.last) continue;
    people.push(person);
    if (people.length === BLOG_PEOPLE_MAX) break;
  }
  return people;
}

export type BlogPostFields =
  | {
      ok: true;
      title: string;
      body: string;
      kind: BlogKind;
      people: BlogPerson[];
      metaTitle: string;
      metaDescription: string;
    }
  | { ok: false; error: string };

/** A post's title, text, kind, people and meta title and description, as typed, checked and trimmed. */
export function readBlogPostFields(
  title: unknown,
  body: unknown,
  kind: unknown = "person",
  people: unknown = [],
  metaTitle: unknown = "",
  metaDescription: unknown = "",
): BlogPostFields {
  const t = typeof title === "string" ? title.trim().replace(/\s+/g, " ") : "";
  const b = typeof body === "string" ? body.trim() : "";
  const mt = typeof metaTitle === "string" ? metaTitle.trim().replace(/\s+/g, " ") : "";
  const md =
    typeof metaDescription === "string" ? metaDescription.trim().replace(/\s+/g, " ") : "";
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
  if (mt.length > BLOG_META_TITLE_MAX) {
    return { ok: false, error: `Keep the meta title under ${BLOG_META_TITLE_MAX} characters.` };
  }
  if (md.length > BLOG_META_DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `Keep the meta description under ${BLOG_META_DESCRIPTION_MAX} characters.`,
    };
  }
  return {
    ok: true,
    title: t,
    body: b,
    kind: readBlogKind(kind),
    people: readBlogPeople(people),
    metaTitle: mt,
    metaDescription: md,
  };
}

/**
 * What a post's page tells search engines and link previews: its own meta
 * title and description, or else its title and its first words.
 */
export function blogPostMeta(
  post: Pick<BlogPost, "title" | "body" | "metaTitle" | "metaDescription">,
): { title: string; description: string } {
  return {
    title: post.metaTitle || post.title,
    description: post.metaDescription || blogExcerpt(post.body, BLOG_META_DESCRIPTION_MAX),
  };
}

/**
 * The ancestree mark in a post's Markdown: a line of its own, put there
 * from the editor's preview, drawn as the logo between two blocks. An
 * HTML comment, so anything else that reads the Markdown shows nothing.
 */
export const BLOG_MARK = "<!-- ancestree -->";

/** Whether a top-level HTML block is the mark. */
export function isBlogMark(html: string): boolean {
  return /^<!--\s*ancestree\s*-->$/.test(html.trim());
}

/** `body` with the mark put on its own line at `offset`, a block's start. */
export function withBlogMarkAt(body: string, offset: number): string {
  const before = body.slice(0, offset).replace(/\s+$/, "");
  const after = body.slice(offset).replace(/^(?:[ \t\r]*\n)+/, "");
  return `${before}\n\n${BLOG_MARK}\n\n${after}`;
}

/** `body` without the mark between `start` and `end`, one blank line left in its place. */
export function withoutBlogMarkAt(body: string, start: number, end: number): string {
  const before = body.slice(0, start).replace(/\s+$/, "");
  const after = body.slice(end).replace(/^[ \t\r]*\n/, "").replace(/^(?:[ \t\r]*\n)+/, "");
  if (!after.trim()) return before;
  return before ? `${before}\n\n${after}` : after;
}

/**
 * The first words of a post's Markdown as plain text, for the library's
 * cards and the feed: headings' marks, emphasis, links' addresses,
 * pictures and code fences taken out, cut at a word within `max`
 * characters, with an ellipsis when there's more.
 */
export function blogExcerpt(body: string, max = 200): string {
  const text = body
    .replace(/<!--[\s\S]*?-->/g, " ")
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
