import { describe, expect, it } from "vitest";

import { inviteRenewedNotice, lapsedState, relativesOnTree } from "@/lib/lapsed-invites";

describe("lapsedState", () => {
  it("takes the database's states and closes anything else", () => {
    expect(lapsedState("open")).toBe("open");
    expect(lapsedState("sent")).toBe("sent");
    expect(lapsedState("joined")).toBe("joined");
    expect(lapsedState("closed")).toBe("closed");
    expect(lapsedState("gone")).toBe("closed");
    expect(lapsedState(null)).toBe("closed");
  });
});

describe("relativesOnTree", () => {
  it("counts, and names nobody", () => {
    expect(relativesOnTree(12)).toBe("12 relatives are on it already.");
    expect(relativesOnTree(2)).toBe("2 relatives are on it already.");
  });

  it("says nothing for the inviter alone, or no count", () => {
    expect(relativesOnTree(1)).toBeNull();
    expect(relativesOnTree(0)).toBeNull();
    expect(relativesOnTree(undefined)).toBeNull();
  });
});

describe("inviteRenewedNotice", () => {
  it("names who it went to by their record's name", () => {
    expect(
      inviteRenewedNotice({ name: "Leila  Haddad", email: "leila@x.com", treeName: "Haddad Family" }),
    ).toBe("Leila Haddad’s invite to Haddad Family had expired, so we emailed them a fresh link.");
  });

  it("falls back on the address the inviter typed", () => {
    expect(
      inviteRenewedNotice({ name: " ", email: "leila@x.com", treeName: "Haddad Family" }),
    ).toBe("leila@x.com’s invite to Haddad Family had expired, so we emailed them a fresh link.");
  });
});
