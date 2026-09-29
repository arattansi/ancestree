import { describe, expect, it } from "vitest";

import { hasMessagesApp, messagesHref, whatsappHref } from "@/lib/share-text";

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
