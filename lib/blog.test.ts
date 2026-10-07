import { describe, expect, it } from "vitest";

import {
  BLOG_PEOPLE_MAX,
  blogExcerpt,
  blogFeedHref,
  blogHref,
  blogOneClickUnsubscribeHref,
  blogPostHref,
  blogSubscriptionHref,
  coverPhotoUrl,
  isBlogSlug,
  readBlogKind,
  readBlogPeople,
  readBlogPostFields,
} from "@/lib/blog";
import { BLOG_BODY_MAX, BLOG_TITLE_MAX } from "@/lib/limits";

describe("blog links", () => {
  it("live under /library", () => {
    expect(blogHref()).toBe("/library");
    expect(blogPostHref("our-first-story")).toBe("/library/our-first-story");
  });

  it("know their slugs", () => {
    expect(isBlogSlug("our-first-story")).toBe(true);
    expect(isBlogSlug("post-2a1f")).toBe(true);
    expect(isBlogSlug("Our Story")).toBe(false);
    expect(isBlogSlug("-leading")).toBe(false);
    expect(isBlogSlug("two--dashes")).toBe(false);
    expect(isBlogSlug("../admin")).toBe(false);
  });
});

describe("readBlogPostFields", () => {
  it("trims the title and the text", () => {
    expect(readBlogPostFields("  Our   first story ", "  Once upon a time.\n\n ")).toEqual({
      ok: true,
      title: "Our first story",
      body: "Once upon a time.",
      kind: "person",
      people: [],
    });
  });

  it("allows an empty text: a draft with only a title", () => {
    expect(readBlogPostFields("Soon", "")).toMatchObject({ ok: true, title: "Soon", body: "" });
    expect(readBlogPostFields("Soon", undefined)).toMatchObject({ ok: true, body: "" });
  });

  it("needs a title within the database's limits", () => {
    expect(readBlogPostFields("", "text")).toEqual({
      ok: false,
      error: "Give the post a title.",
    });
    expect(readBlogPostFields("   ", "text").ok).toBe(false);
    expect(readBlogPostFields("x".repeat(BLOG_TITLE_MAX), "").ok).toBe(true);
    expect(readBlogPostFields("x".repeat(BLOG_TITLE_MAX + 1), "")).toEqual({
      ok: false,
      error: `Keep the title under ${BLOG_TITLE_MAX} characters.`,
    });
  });

  it("says by how much a text is too long", () => {
    expect(readBlogPostFields("T", "x".repeat(BLOG_BODY_MAX)).ok).toBe(true);
    expect(readBlogPostFields("T", "x".repeat(BLOG_BODY_MAX + 1500))).toEqual({
      ok: false,
      error: "Too long by 1,500 characters.",
    });
  });
});

describe("blogExcerpt", () => {
  it("reads Markdown as plain words", () => {
    expect(
      blogExcerpt(
        "# A heading\n\nShe **always** said _this_: see [the tree](/tree).\n\n- one\n- two\n\n> quoted\n\n---\n\n```\ncode\n```\n\n![a photo](x.jpg) The end.",
      ),
    ).toBe("A heading She always said this: see the tree. one two quoted The end.");
  });

  it("cuts at a word, with an ellipsis, only when there's more", () => {
    expect(blogExcerpt("Short and sweet.", 50)).toBe("Short and sweet.");
    expect(blogExcerpt("The quick brown fox jumps over the lazy dog, again.", 20)).toBe(
      "The quick brown fox…",
    );
    expect(blogExcerpt("Twenty characters!!", 20)).toBe("Twenty characters!!");
    expect(blogExcerpt("a".repeat(30), 10)).toBe("aaaaaaaaaa…");
  });
});

describe("readBlogPeople", () => {
  it("trims each person, keeps the nameless out, and stops at the limit", () => {
    expect(
      readBlogPeople([
        { first: " Amarshi ", last: "Sayani", maiden: "", place: " Kutch,  India " },
        { first: "", last: "", maiden: "", place: "Mombasa" },
        "not a person",
        { first: "Sakina", maiden: "Ladha" },
      ]),
    ).toEqual([
      { first: "Amarshi", last: "Sayani", maiden: "", place: "Kutch, India" },
      { first: "Sakina", last: "", maiden: "Ladha", place: "" },
    ]);
    expect(readBlogPeople("nobody")).toEqual([]);
    expect(
      readBlogPeople(Array.from({ length: BLOG_PEOPLE_MAX + 3 }, (_, i) => ({ first: `P${i}` }))),
    ).toHaveLength(BLOG_PEOPLE_MAX);
  });
});

describe("readBlogKind and the rest of the fields", () => {
  it("falls back to a person", () => {
    expect(readBlogKind("couple")).toBe("couple");
    expect(readBlogKind("crowd")).toBe("person");
    expect(readBlogKind(undefined)).toBe("person");
    const fields = readBlogPostFields("T", "", "family", [{ first: "A", last: "B" }]);
    expect(fields).toMatchObject({ ok: true, kind: "family" });
    expect(fields.ok && fields.people).toHaveLength(1);
  });
});

describe("library links", () => {
  it("know the feed and a subscription's pages", () => {
    expect(blogFeedHref()).toBe("/library/feed.xml");
    expect(blogSubscriptionHref("abc")).toBe("/library/subscription/abc");
    expect(blogSubscriptionHref("abc", true)).toBe("/library/subscription/abc?confirm=1");
    expect(blogOneClickUnsubscribeHref("abc")).toBe("/api/library/subscription/abc");
  });

  it("address a cover photo in the public bucket", () => {
    const was = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co/";
    expect(coverPhotoUrl("id/a b.jpg")).toBe(
      "https://x.supabase.co/storage/v1/object/public/library/id/a%20b.jpg",
    );
    expect(coverPhotoUrl(null)).toBeNull();
    process.env.NEXT_PUBLIC_SUPABASE_URL = was;
  });
});
