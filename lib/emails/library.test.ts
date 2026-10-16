import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { librarySubmissionEmail } from "@/lib/emails/library";

const base = {
  title: "Amina <b>Khan</b>",
  body: "She grew figs & roses.\nEvery summer.\n\n<script>alert(1)</script>\n\n\n[a link](https://example.com)",
  who: "Amina Khan & Yusuf Khan",
  withPhoto: true,
  copyUrl: "https://www.ancestree.space/library/submissions/abc",
};

describe("librarySubmissionEmail (Step 157)", () => {
  it("names the story in the subject, as plain text", () => {
    expect(librarySubmissionEmail(base).subject).toBe(
      "Your story for stories-of-our-wise: Amina <b>Khan</b>",
    );
  });

  it("sends what was written back word for word, escaped, its paragraphs kept", () => {
    const { html } = librarySubmissionEmail(base);
    expect(html).toContain("Amina &lt;b&gt;Khan&lt;/b&gt;");
    expect(html).toContain("She grew figs &amp; roses.<br />Every summer.</p>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;</p>");
    expect(html).not.toContain("<script>");
    // Markdown isn't read: a link stays as typed, not a live one.
    expect(html).toContain("[a link](https://example.com)</p>");
    expect(html).not.toContain('href="https://example.com"');
    expect(html).toContain("About Amina Khan &amp; Yusuf Khan, with a photo");
  });

  it("asks for a change through the copy's own link", () => {
    const { html } = librarySubmissionEmail(base);
    expect(html).toContain('href="https://www.ancestree.space/library/submissions/abc"');
    expect(html).toContain(">ask for a change</a>");
    expect(html).toContain("If you didn&rsquo;t send this");
  });

  it("leaves out what wasn't sent", () => {
    const { html } = librarySubmissionEmail({ ...base, who: "", withPhoto: false });
    expect(html).not.toContain("with a photo");
    expect(html).not.toContain(">About ");
  });
});
