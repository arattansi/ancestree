import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { cardThanksEmail } from "@/lib/emails/card-thanks";

describe("cardThanksEmail", () => {
  it("carries the person's own words, in the card's lower case around them", () => {
    const { subject, html } = cardThanksEmail({
      firstName: "Ada",
      signerName: "Emeka",
      message: "Thank you all.\nI loved every page.",
    });
    expect(subject).toBe("a thank-you from Ada");
    expect(html).toContain("thank you, Emeka.");
    expect(html).toContain("Ada thanked everyone who signed the birthday card:");
    expect(html).toContain("“Thank you all.<br>I loved every page.”");
    expect(html).toContain("It has been deleted.");
  });

  it("escapes what people typed", () => {
    const { html } = cardThanksEmail({ firstName: "<i>Ada</i>", signerName: "<b>E</b>", message: "<script>" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>E</b>");
    expect(html).not.toContain("<i>Ada</i>");
  });
});
