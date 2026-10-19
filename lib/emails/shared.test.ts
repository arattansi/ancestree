import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { renderEmail } from "@/lib/emails/shared";

/*
 * Every email's header carries the tagline under the wordmark, written
 * lower-case and drawn in small caps (docs/design-system.md "Brand"). The
 * home page's changed in Step 188; the emails followed in Step 192. The
 * Supabase Auth templates are a separate pipeline with their own copy of
 * the header, so they're checked here too.
 */

const TAGLINE = "the family tree you grow together.";
const ROOT = path.resolve(__dirname, "../..");
const AUTH_TEMPLATES = [
  "supabase/templates/confirm-signup.html",
  "supabase/templates/magic-link.html",
];

/** The paragraph drawn in small caps under the wordmark. */
function taglineOf(html: string): string | undefined {
  return html.match(/font-variant:small-caps;[^"]*">([^<]*)<\/p>/)?.[1];
}

describe("the email header's tagline", () => {
  const html = renderEmail({
    title: "Welcome",
    preheader: "Welcome",
    heading: "Hi Zahra,",
    cta: { label: "open your tree", url: "https://www.ancestree.space/family" },
    footnoteHtml: "ancestree · a private family tree",
  });

  it("is the home page's, in small caps under the wordmark", () => {
    expect(taglineOf(html)).toBe(TAGLINE);
    expect(html.indexOf(">ancestree</p>")).toBeLessThan(html.indexOf(TAGLINE));
  });

  it.each(AUTH_TEMPLATES)("is the same in %s", (file) => {
    const template = fs.readFileSync(path.join(ROOT, file), "utf8");
    expect(taglineOf(template)).toBe(TAGLINE);
  });
});
