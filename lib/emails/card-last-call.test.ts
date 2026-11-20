import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { cardLastCallEmail } from "@/lib/emails/card-last-call";

const base = {
  firstName: "Ada",
  opensOn: "2026-11-28",
  daysAway: 7,
  signatures: 4,
  url: "https://www.ancestree.space/family?person=p1",
  unsubscribe: "https://www.ancestree.space/card-emails/t1",
};

describe("cardLastCallEmail", () => {
  it("says it in Aalim's words, with the day and how many signed", () => {
    const { subject, html } = cardLastCallEmail(base);
    expect(subject).toBe("last chance to sign Ada’s birthday card!");
    expect(html).toContain("last chance to sign Ada’s birthday card!");
    expect(html).toContain("Ada’s birthday is in a week, on 28 november. 4 people have signed.");
    expect(html).toContain("sign the card");
    expect(html).toContain("https://www.ancestree.space/family?person=p1");
    expect(html).toContain('href="https://www.ancestree.space/card-emails/t1"');
    expect(html).toContain("Unsubscribe");
  });

  it("counts nobody and one, and a card started late", () => {
    expect(cardLastCallEmail({ ...base, signatures: 0 }).html).toContain("nobody has signed yet.");
    expect(cardLastCallEmail({ ...base, signatures: 1 }).html).toContain("1 person has signed.");
    expect(cardLastCallEmail({ ...base, daysAway: 3 }).html).toContain("is in 3 days, on 28 november.");
    expect(cardLastCallEmail({ ...base, daysAway: 1 }).html).toContain("is tomorrow, 28 november.");
    expect(cardLastCallEmail({ ...base, daysAway: 0 }).html).toContain("is today, 28 november.");
    // A day off where the member is, ahead of the person's time zone.
    expect(cardLastCallEmail({ ...base, daysAway: 8 }).html).toContain("Ada’s birthday is on 28 november.");
  });

  it("escapes the name in the copy but not the subject, and does without one", () => {
    const named = cardLastCallEmail({ ...base, firstName: "<b>Ada</b>" });
    expect(named.subject).toBe("last chance to sign <b>Ada</b>’s birthday card!");
    expect(named.html).not.toContain("<b>Ada</b>");
    expect(named.html).toContain("&lt;b&gt;Ada&lt;/b&gt;’s birthday");
    expect(cardLastCallEmail({ ...base, firstName: "  " }).subject).toBe(
      "last chance to sign a birthday card!",
    );
  });
});
