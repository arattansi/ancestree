import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { claimInviteEmail } from "@/lib/emails/claim-invite";

const base = {
  firstName: "Leah",
  entryName: "Leah Harlow",
  inviterName: "Ruth",
  treeName: "Harlow Family",
  url: "https://www.ancestree.space/join/abc",
};

describe("claimInviteEmail", () => {
  it("greets them by name and names the entry", () => {
    const { html } = claimInviteEmail(base);
    expect(html).toContain("You&rsquo;re invited, Leah");
    expect(html).toContain(">Leah Harlow</strong>");
    expect(html).toContain("https://www.ancestree.space/join/abc");
  });

  it("says who added them to which tree (Step 163)", () => {
    const { subject, html } = claimInviteEmail(base);
    expect(subject).toBe("Ruth added you to Harlow Family");
    expect(html.replace(/\s+/g, " ")).toContain("Ruth has been building Harlow Family on ancestree");
    expect(html).toContain("expires in 30 days");
  });

  it("greets a child invited to their placeholder by no name (Step 98.3)", () => {
    const { subject, html } = claimInviteEmail({
      ...base,
      firstName: "Second Child",
      entryName: "Second Child",
      placeholder: true,
    });
    expect(subject).toBe("Ruth added you to Harlow Family");
    expect(html).toContain("You&rsquo;re invited<");
    expect(html).not.toContain("Second Child");
    expect(html.replace(/\s+/g, " ")).toContain("Ruth has kept a place for you on Harlow Family");
    expect(html.replace(/\s+/g, " ")).toContain(
      "Your details are hidden from the family until your parent approves.",
    );
    expect(html).toContain("https://www.ancestree.space/join/abc");
  });

  it("escapes the tree's name in the email, not the subject", () => {
    const { subject, html } = claimInviteEmail({ ...base, treeName: "The <Harlows>\n& co" });
    expect(subject).toBe("Ruth added you to The <Harlows> & co");
    expect(html).toContain("The &lt;Harlows&gt;");
    expect(html).not.toContain("<Harlows>");
  });
});
