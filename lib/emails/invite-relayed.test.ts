import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { inviteRelayedEmail } from "@/lib/emails/invite-relayed";
import { relayHref } from "@/lib/invite-relays";

const SITE = "https://www.ancestree.space";
const RELAY = "6f1c2b3a-0000-4000-8000-000000000305";

describe("inviteRelayedEmail (Step 30.5)", () => {
  const base = {
    firstName: "Zahra",
    lastName: "Suleman",
    email: "zahra@example.com",
    url: `${SITE}${relayHref(RELAY)}`,
  };

  it("says who is looking for their family, in the subject and the heading", () => {
    const { subject, html } = inviteRelayedEmail(base);
    expect(subject).toBe("Zahra Suleman asked you to invite them to ancestree");
    expect(html).toContain("Zahra Suleman is looking for their family</p>");
  });

  it("names the address the invite is filled in for, and what they'd join as", () => {
    const { html } = inviteRelayedEmail(base);
    expect(html).toContain("invite to zahra@example.com for you");
    expect(html).toContain("join as a Leaf");
  });

  it("links to the ask on their account page, its & escaped for HTML", () => {
    const { html } = inviteRelayedEmail(base);
    const href = `${SITE}/account?view=settings&amp;relay=${RELAY}`;
    expect(html).toContain(`href="${href}"`);
    expect(html).toContain(`>${href}</a>`);
    expect(html).toContain(">Invite them</a>");
  });

  it("tells the member the newcomer hasn't learned they're on ancestree", () => {
    const { html } = inviteRelayedEmail(base);
    expect(html).toContain("We haven&rsquo;t told them whether you&rsquo;re on");
  });

  it("says an ask left unanswered lapses after 30 days (Step 41.5)", () => {
    const { html } = inviteRelayedEmail(base);
    expect(html).toContain("their request lapses after 30 days.");
  });

  it("says how to stop relatives asking, in the box's own words (Step 41.5)", () => {
    const { html } = inviteRelayedEmail(base);
    expect(html).toMatch(
      /To stop relatives asking you, untick\s+&ldquo;Relatives can ask me to invite them&rdquo; in your\s+account&rsquo;s settings\./,
    );
  });

  it("escapes what the newcomer typed, in the HTML and nowhere else", () => {
    const { subject, html } = inviteRelayedEmail({
      ...base,
      firstName: `<script>alert("x")</script>`,
      lastName: "O'Brien & Co",
      email: "o'brien@example.com",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("O&#39;Brien &amp; Co");
    expect(html).toContain("o&#39;brien@example.com");
    expect(subject).toBe(
      `<script>alert("x")</script> O'Brien & Co asked you to invite them to ancestree`,
    );
  });

  it("keeps a subject to one line, whatever was typed", () => {
    const { subject } = inviteRelayedEmail({
      ...base,
      firstName: "Zahra\r\nBcc: someone@example.com",
      lastName: "\tSuleman ",
    });
    expect(subject).toBe(
      "Zahra Bcc: someone@example.com Suleman asked you to invite them to ancestree",
    );
    expect(subject).not.toMatch(/[\r\n\t]/);
  });
});
