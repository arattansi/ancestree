import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { markdownEmailHtml, safeHref } from "@/lib/emails/markdown";

describe("markdownEmailHtml (Step 159)", () => {
  it("bolds, italicizes and strikes through", () => {
    const html = markdownEmailHtml("**Eid** _Mubarak_ ~~late~~");
    expect(html).toContain('<strong style="font-weight:600;">Eid</strong>');
    expect(html).toContain("<em>Mubarak</em>");
    expect(html).toContain("<s>late</s>");
  });

  it("links words, and an address on its own", () => {
    const html = markdownEmailHtml(
      "Read [the library](https://www.ancestree.space/library) or www.example.com",
    );
    expect(html).toMatch(
      /<a href="https:\/\/www\.ancestree\.space\/library" style="[^"]*">the library<\/a>/,
    );
    expect(html).toMatch(/<a href="http:\/\/www\.example\.com\/" [^>]*>www\.example\.com<\/a>/);
  });

  it("follows a reference-style link", () => {
    const html = markdownEmailHtml("See [this][1].\n\n[1]: https://example.com/a");
    expect(html).toMatch(/<a href="https:\/\/example\.com\/a" [^>]*>this<\/a>/);
    expect(html).not.toContain("[1]");
  });

  it("links nowhere unsafe", () => {
    const html = markdownEmailHtml("[click](javascript:alert(1)) [x](data:text/html,hi)");
    expect(html).not.toContain("<a ");
    expect(html).toContain("click");
  });

  it("keeps raw HTML as the text it was, and loads no pictures", () => {
    const html = markdownEmailHtml('<b onclick="x">hi</b>\n\n![Nani at Eid](https://evil.example/p.png)');
    expect(html).toContain("&lt;b onclick=&quot;x&quot;&gt;hi&lt;/b&gt;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("evil.example");
    expect(html).toContain("<em>Nani at Eid</em>");
  });

  it("keeps a single line break, and splits paragraphs on a blank line", () => {
    const html = markdownEmailHtml("Eid Mubarak <3\nSee you Sunday.\n\nLove, Aalim");
    expect(html).toContain("Eid Mubarak &lt;3<br />See you Sunday.</p>");
    expect(html.match(/<p /g)).toHaveLength(2);
    // The first block sits flush; the next is spaced from it.
    expect(html).toMatch(/^<p style="margin:0;/);
    expect(html).toContain('<p style="margin:12px 0 0;');
  });

  it("draws lists, headings, quotations and a line across", () => {
    const html = markdownEmailHtml("# News\n\n- one\n- two\n\n3. three\n4. four\n\n> said\n\n---");
    expect(html).toContain("font-size:18px");
    expect(html).toMatch(/<ul [^>]*><li style="">one<\/li><li style="margin-top:4px;">two<\/li><\/ul>/);
    expect(html).toContain('<ol start="3"');
    expect(html).toMatch(/<blockquote [^>]*><p [^>]*color:#737373;">said<\/p><\/blockquote>/);
    expect(html).toContain("height:1px;background-color:#e5e5e5");
  });

  it("escapes code", () => {
    expect(markdownEmailHtml("`<x>`")).toContain(">&lt;x&gt;</code>");
  });
});

describe("safeHref", () => {
  it("takes web and mail addresses, our paths, and a domain without https://", () => {
    expect(safeHref("https://a.com/b?c=1&d=2")).toBe("https://a.com/b?c=1&d=2");
    expect(safeHref("mailto:hi@a.com")).toBe("mailto:hi@a.com");
    expect(safeHref("ancestree.space/library")).toBe("https://ancestree.space/library");
    expect(safeHref("/library")).toMatch(/^https?:\/\/[^/]+\/library$/);
  });

  it("refuses anything else", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("hello")).toBeNull();
  });
});
