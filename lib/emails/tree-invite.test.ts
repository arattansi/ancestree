import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { treeInviteEmail } from "@/lib/emails/tree-invite";

const base = {
  firstName: "Leila",
  inviterName: "Omar",
  treeName: "Haddad Family",
  url: "https://www.ancestree.space/join/abc",
  entryName: null,
};

const text = (html: string) => html.replace(/\s+/g, " ");

describe("treeInviteEmail", () => {
  it("sends a direct invite as one again", () => {
    const { subject, html } = treeInviteEmail({ ...base, source: "direct" });
    expect(subject).toBe("Omar invited you to Haddad Family");
    expect(text(html)).toContain("Omar invited you to help build Haddad Family on ancestree.");
  });

  it("sends an invite naming an entry as a claim invite", () => {
    const { subject, html } = treeInviteEmail({
      ...base,
      source: "direct",
      entryName: "Leila Haddad",
    });
    expect(subject).toBe("Omar added you to Haddad Family");
    expect(html).toContain(">Leila Haddad</strong>");
  });

  it("keeps an approved request's wording", () => {
    const plain = treeInviteEmail({ ...base, source: "request" });
    expect(plain.subject).toBe("Omar invited you to Haddad Family");
    expect(text(plain.html)).toContain("approved your request to join Haddad Family");
    const named = treeInviteEmail({ ...base, source: "request", entryName: "Leila Haddad" });
    expect(named.subject).toBe("Omar added you to Haddad Family");
    expect(text(named.html)).toContain("approved your request");
  });

  it("says the family tree for one with a default name", () => {
    const { subject, html } = treeInviteEmail({ ...base, source: "direct", treeName: "Family" });
    expect(subject).toBe("Omar invited you to the family tree");
    expect(text(html)).toContain("Omar invited you to help build the family tree on ancestree.");
  });

  it("treats no record as a direct invite", () => {
    expect(treeInviteEmail({ ...base, source: null }).subject).toBe(
      "Omar invited you to Haddad Family",
    );
  });
});
