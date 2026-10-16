import { describe, expect, it } from "vitest";

import {
  emailShareHref,
  facebookShareHref,
  hasMessagesApp,
  messagesHref,
  whatsappHref,
  xShareHref,
} from "@/lib/share-text";

const text = "This week:\n🎂 Today: Amina Khan's birthday";

describe("share links (Step 89)", () => {
  it("opens WhatsApp with the text, encoded", () => {
    const href = whatsappHref(text);
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(href.slice("https://wa.me/?text=".length))).toBe(
      text,
    );
  });

  it("opens Messages with the text as the body", () => {
    const href = messagesHref(text);
    expect(href.startsWith("sms:?&body=")).toBe(true);
    expect(decodeURIComponent(href.slice("sms:?&body=".length))).toBe(text);
  });

  it("offers Messages only where an sms: link opens it", () => {
    expect(
      hasMessagesApp(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
      ),
    ).toBe(true);
    expect(
      hasMessagesApp("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
    ).toBe(true);
    expect(hasMessagesApp("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(
      true,
    );
    expect(
      hasMessagesApp("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140"),
    ).toBe(false);
  });
});

describe("a library post shared (Step 157)", () => {
  const url = "https://www.ancestree.space/library/amina-khan?x=1&y=2";
  const title = "Amina Khan & her garden";

  it("hands Facebook the post's address", () => {
    const href = new URL(facebookShareHref(url));
    expect(href.origin + href.pathname).toBe("https://www.facebook.com/sharer/sharer.php");
    expect(href.searchParams.get("u")).toBe(url);
  });

  it("types the title and the address into X", () => {
    const href = new URL(xShareHref(url, title));
    expect(href.origin + href.pathname).toBe("https://x.com/intent/post");
    expect(href.searchParams.get("text")).toBe(title);
    expect(href.searchParams.get("url")).toBe(url);
  });

  it("starts an email with the title as its subject and the address in it", () => {
    const href = emailShareHref(title, `${title}\n${url}`);
    expect(href.startsWith("mailto:?subject=")).toBe(true);
    const params = new URLSearchParams(href.slice("mailto:?".length));
    expect(params.get("subject")).toBe(title);
    expect(params.get("body")).toBe(`${title}\n${url}`);
  });
});
