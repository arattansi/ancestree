import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { inviteReminderEmail } from "@/lib/emails/invite-reminder";

const base = {
  stage: 1 as const,
  firstName: "Leila",
  inviterName: "Omar",
  treeName: "Haddad Family",
  entryName: null,
  placeholder: false,
  daysLeft: 25,
  url: "https://www.ancestree.space/join/abc",
};

const text = (html: string) => html.replace(/\s+/g, " ");

describe("inviteReminderEmail", () => {
  it("goes on day 5 under the invite's own subject, with its link", () => {
    const { subject, html } = inviteReminderEmail(base);
    expect(subject).toBe("Omar invited you to Haddad Family");
    expect(html).toContain("You&rsquo;re still invited, Leila");
    expect(text(html)).toContain("Omar invited you to Haddad Family on ancestree.");
    expect(text(html)).toContain("still signs you straight in, for 25 days more.");
    expect(html).toContain('href="https://www.ancestree.space/join/abc"');
    expect(html).toContain(">join ancestree</a>");
  });

  it("says on day 25 when it runs out", () => {
    const { subject, html } = inviteReminderEmail({ ...base, stage: 2, daysLeft: 5 });
    expect(subject).toBe("Your invite to Haddad Family expires in 5 days");
    expect(text(html)).toContain("but it expires in 5 days.");
  });

  it("says one day, not one days", () => {
    const { subject } = inviteReminderEmail({ ...base, stage: 2, daysLeft: 1 });
    expect(subject).toBe("Your invite to Haddad Family expires in 1 day");
  });

  it("names the entry waiting for them to claim", () => {
    const { subject, html } = inviteReminderEmail({ ...base, entryName: "Leila Haddad" });
    expect(subject).toBe("Omar added you to Haddad Family");
    expect(text(html)).toContain("Omar added you to Haddad Family on ancestree, where an entry for");
    expect(html).toContain(">Leila Haddad</strong>");
  });

  it("greets a child's placeholder by no name (Step 98.3)", () => {
    const { html } = inviteReminderEmail({
      ...base,
      firstName: "Second",
      entryName: "Second Child",
      placeholder: true,
    });
    expect(html).toContain("You&rsquo;re still invited<");
    expect(html).not.toContain("Second");
    expect(text(html)).toContain("Omar has kept a place for you on Haddad Family on ancestree.");
  });

  it("escapes what it's given", () => {
    const { html } = inviteReminderEmail({ ...base, firstName: "<b>L</b>", treeName: "<i>T</i>" });
    expect(html).not.toContain("<b>L</b>");
    expect(html).not.toContain("<i>T</i>");
    expect(html).toContain("&lt;b&gt;L&lt;/b&gt;");
  });
});
