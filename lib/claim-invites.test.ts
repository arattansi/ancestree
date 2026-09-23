import { describe, expect, it } from "vitest";

import {
  claimInviteRecordName,
  claimInvitesShown,
  describeClaimInvite,
  type ClaimInviteRow,
  type EntryInvite,
} from "@/lib/claim-invites";

const NOW = new Date("2026-09-23T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const daysAhead = (d: number) => daysAgo(-d);

const ROOT = "root-user";
const LEAF = "leaf-user";

function row(over: Partial<ClaimInviteRow> = {}): ClaimInviteRow {
  return {
    id: "inv-1",
    personId: "person-1",
    sentBy: ROOT,
    sentByName: "Aalim Rattansi",
    email: "cousin@example.com",
    sentAt: daysAgo(1),
    expiresAt: daysAhead(13),
    archived: false,
    emailSent: true,
    ...over,
  };
}

describe("claimInviteRecordName (Step 38)", () => {
  it("names the record after the entry as its card shows it", () => {
    expect(
      claimInviteRecordName({ first_name: "Muhammad", preferred_name: "Mo", last_name: "Rattansi" }),
    ).toEqual({ first_name: "Mo", last_name: "Rattansi" });
  });

  it("falls back to the first name when the preferred name is blank", () => {
    expect(
      claimInviteRecordName({ first_name: " Zahra ", preferred_name: "  ", last_name: " Ali " }),
    ).toEqual({ first_name: "Zahra", last_name: "Ali" });
  });
});

describe("claimInvitesShown (Step 38)", () => {
  it("lists every live invite for an entry, newest first", () => {
    const shown = claimInvitesShown(
      [
        row({ id: "older", sentAt: daysAgo(3) }),
        row({ id: "newer", sentAt: daysAgo(1) }),
      ],
      { userId: ROOT, isRoot: true },
      NOW,
    );
    expect(shown.map((i) => i.id)).toEqual(["newer", "older"]);
    expect(shown.every((i) => i.live)).toBe(true);
  });

  it("leaves a lapsed invite off while a live one is out", () => {
    const shown = claimInvitesShown(
      [
        row({ id: "live", sentAt: daysAgo(1) }),
        row({ id: "lapsed", sentAt: daysAgo(20), expiresAt: daysAgo(6), archived: true }),
      ],
      { userId: ROOT, isRoot: true },
      NOW,
    );
    expect(shown.map((i) => i.id)).toEqual(["live"]);
  });

  it("shows only the latest lapsed invite when none is live", () => {
    const shown = claimInvitesShown(
      [
        row({ id: "first", sentAt: daysAgo(40), expiresAt: daysAgo(26), archived: true }),
        // Expired, and not yet archived: nobody has opened the console since.
        row({ id: "second", sentAt: daysAgo(20), expiresAt: daysAgo(6) }),
      ],
      { userId: ROOT, isRoot: true },
      NOW,
    );
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ id: "second", live: false });
  });

  it("keeps each entry's invites to that entry", () => {
    const shown = claimInvitesShown(
      [row({ id: "a", personId: "p-a" }), row({ id: "b", personId: "p-b" })],
      { userId: ROOT, isRoot: true },
      NOW,
    );
    expect(shown.map((i) => [i.personId, i.id])).toEqual([
      ["p-a", "a"],
      ["p-b", "b"],
    ]);
  });

  it("gives the address to a Root and to whoever sent it, and to nobody else", () => {
    const rows = [row({ sentBy: LEAF, sentByName: "Arzu" })];
    expect(claimInvitesShown(rows, { userId: ROOT, isRoot: true }, NOW)[0].email).toBe(
      "cousin@example.com",
    );
    expect(claimInvitesShown(rows, { userId: LEAF, isRoot: false }, NOW)[0]).toMatchObject({
      email: "cousin@example.com",
      sentByViewer: true,
    });
    expect(claimInvitesShown(rows, { userId: "someone-else", isRoot: false }, NOW)[0]).toMatchObject({
      email: null,
      sentByName: "Arzu",
      sentByViewer: false,
    });
  });

  it("marks an invite whose email is known to have failed, and only that", () => {
    const shown = claimInvitesShown(
      [
        row({ id: "failed", personId: "p-1", emailSent: false }),
        row({ id: "unknown", personId: "p-2", emailSent: null }),
      ],
      { userId: ROOT, isRoot: true },
      NOW,
    );
    expect(shown.map((i) => [i.id, i.emailFailed])).toEqual([
      ["failed", true],
      ["unknown", false],
    ]);
  });
});

describe("describeClaimInvite (Step 38)", () => {
  const fmt = (iso: string) => iso.slice(0, 10);
  function invite(over: Partial<EntryInvite> = {}): EntryInvite {
    return {
      id: "inv-1",
      personId: "person-1",
      sentByName: "Aalim Rattansi",
      sentByViewer: false,
      sentAt: "2026-09-23T08:14:48.510Z",
      expiresAt: "2026-10-07T08:14:48.510Z",
      live: true,
      emailFailed: false,
      email: null,
      ...over,
    };
  }

  it("says who sent a live invite, when, and until when it works", () => {
    expect(describeClaimInvite(invite(), fmt)).toBe(
      "Aalim Rattansi sent an invite on 2026-09-23. The link works until 2026-10-07.",
    );
  });

  it("says “you” to the sender, with the address", () => {
    expect(
      describeClaimInvite(invite({ sentByViewer: true, email: "cousin@example.com" }), fmt),
    ).toBe(
      "You sent an invite on 2026-09-23 to cousin@example.com. The link works until 2026-10-07.",
    );
  });

  it("says when the email didn't send", () => {
    expect(describeClaimInvite(invite({ emailFailed: true }), fmt)).toBe(
      "Aalim Rattansi made an invite on 2026-09-23, but the email didn’t send.",
    );
  });

  it("says a lapsed invite expired unused", () => {
    expect(describeClaimInvite(invite({ live: false, sentByViewer: true }), fmt)).toBe(
      "The invite you sent on 2026-09-23 expired unused.",
    );
  });

  it("falls back to “a member” for a sender with no name", () => {
    expect(describeClaimInvite(invite({ sentByName: null, expiresAt: null }), fmt)).toBe(
      "A member sent an invite on 2026-09-23. It hasn’t been accepted yet.",
    );
  });
});
