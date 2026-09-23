import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { inviteApprovedEmail } from "@/lib/emails/invite-approved";

const base = {
  firstName: "Amina",
  inviterName: "Karim",
  url: "https://www.ancestree.space/join/abc",
};

describe("inviteApprovedEmail", () => {
  it("says the request was approved, and nothing about an entry by default", () => {
    const { subject, html } = inviteApprovedEmail(base);
    expect(subject).toBe("You’re invited to ancestree");
    expect(html).toContain("Karim approved your request to join the family tree");
    expect(html).toContain("https://www.ancestree.space/join/abc");
    expect(html).not.toContain("already an entry");
  });

  it("names the entry a Root approved them as (Step 30.3)", () => {
    const { html } = inviteApprovedEmail({ ...base, entryName: "Amina Rattansi" });
    expect(html).toContain("Karim approved your request to join the family tree");
    expect(html).toContain("already an entry for");
    expect(html).toContain(">Amina Rattansi</strong>");
    expect(html).toContain("makes that entry yours");
  });

  it("treats an empty entry name as none", () => {
    expect(inviteApprovedEmail({ ...base, entryName: "" }).html).not.toContain(
      "already an entry",
    );
    expect(inviteApprovedEmail({ ...base, entryName: null }).html).not.toContain(
      "already an entry",
    );
  });

  it("escapes the names it's given", () => {
    const { html } = inviteApprovedEmail({
      ...base,
      firstName: "<Amina>",
      entryName: `Amina "Mina" <b>R</b>`,
    });
    expect(html).toContain("&lt;Amina&gt;");
    expect(html).toContain("Amina &quot;Mina&quot; &lt;b&gt;R&lt;/b&gt;");
    expect(html).not.toContain("<b>R</b>");
  });
});
