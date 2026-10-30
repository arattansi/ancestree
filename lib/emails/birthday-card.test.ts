import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { birthdayCardEmail } from "@/lib/emails/birthday-card";

describe("birthdayCardEmail", () => {
  it("says the card is here and how many signed, in the card's lower case", () => {
    const { subject, html } = birthdayCardEmail({
      firstName: "Ada",
      signatures: 14,
      url: "https://www.ancestree.space/family",
    });
    expect(subject).toBe("your birthday card is here");
    expect(html).toContain("happy birthday, Ada.");
    expect(html).toContain("14 people signed it");
    expect(html).toContain("open your card");
    expect(html).toContain("https://www.ancestree.space/family");
  });

  it("counts one signer as one, and escapes the name", () => {
    const { html } = birthdayCardEmail({ firstName: "<b>Ada</b>", signatures: 1, url: "https://x" });
    expect(html).toContain("1 person signed it");
    expect(html).not.toContain("<b>Ada</b>");
  });
});
