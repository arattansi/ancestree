import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StoryMarkdown } from "@/components/story-markdown";

const html = (md: string) =>
  renderToStaticMarkup(createElement(StoryMarkdown, null, md));

describe("StoryMarkdown", () => {
  it("draws headings, emphasis, lists and quotes", () => {
    const out = html("# Title\n\nSome **bold** and *italic*.\n\n- one\n- two\n\n> said");
    expect(out).toContain("<h3");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
    expect(out).toContain("<li>one</li>");
    expect(out).toContain("<blockquote");
  });

  it("draws tables and strikethrough (GFM)", () => {
    const out = html("| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~");
    expect(out).toContain("<table");
    expect(out).toContain("<del>gone</del>");
  });

  it("never lets raw HTML through as markup", () => {
    const out = html('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
  });

  it("opens links safely and refuses a javascript: address", () => {
    const out = html("[home](https://example.com) and [bad](javascript:alert(1))");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain("noopener noreferrer nofollow ugc");
    expect(out).not.toContain("javascript:");
  });

  it("shows a picture as its description, never loading it", () => {
    const out = html("![Nan at the farm](https://tracker.example/p.png)");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("tracker.example");
    expect(out).toContain("Nan at the farm");
  });

  it("keeps a single line break, as plain-text stories were written", () => {
    expect(html("one\ntwo")).toContain("whitespace-pre-line");
  });
});
