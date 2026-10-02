import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { claimInviteEmail } from "@/lib/emails/claim-invite";

const base = {
  firstName: "Leah",
  entryName: "Leah Harlow",
  inviterName: "Ruth",
  url: "https://www.ancestree.space/join/abc",
};

describe("claimInviteEmail", () => {
  it("greets them by name and names the entry", () => {
    const { subject, html } = claimInviteEmail(base);
    expect(subject).toBe("You’re invited to ancestree");
    expect(html).toContain("You&rsquo;re invited, Leah");
    expect(html).toContain(">Leah Harlow</strong>");
    expect(html).toContain("https://www.ancestree.space/join/abc");
  });

  it("greets a child invited to their placeholder by no name (Step 98.3)", () => {
    const { html } = claimInviteEmail({
      ...base,
      firstName: "Second Child",
      entryName: "Second Child",
      placeholder: true,
    });
    expect(html).toContain("You&rsquo;re invited<");
    expect(html).not.toContain("Second Child");
    expect(html).toContain("Ruth has kept a place for you");
    expect(html.replace(/\s+/g, " ")).toContain(
      "Your details are hidden from the family until your parent approves.",
    );
    expect(html).toContain("https://www.ancestree.space/join/abc");
  });
});
