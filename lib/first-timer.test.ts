import { describe, expect, it } from "vitest";

import {
  firstTimerStep,
  newestLiveInvite,
  verifiedEmail,
  type BoundInvite,
} from "@/lib/first-timer";

const NOW = new Date("2026-09-23T12:00:00Z");

function invite(token: string, createdAt: string, expiresAt: string | null): BoundInvite {
  return { token, createdAt, expiresAt };
}

const OLDER = invite("older", "2026-09-10T09:00:00Z", "2026-09-24T09:00:00Z");
const NEWER = invite("newer", "2026-09-20T09:00:00Z", "2026-10-04T09:00:00Z");
const LAPSED = invite("lapsed", "2026-09-22T09:00:00Z", "2026-09-23T11:59:59Z");

describe("verifiedEmail", () => {
  it("takes the address once it's verified, lower-cased as every row keeps it", () => {
    expect(
      verifiedEmail({ email: " Zz308@Example.com ", email_confirmed_at: "2026-09-23T10:00:00Z" }),
    ).toBe("zz308@example.com");
  });

  it("looks nothing up for an address nobody has verified", () => {
    expect(verifiedEmail({ email: "zz308@example.com", email_confirmed_at: null })).toBeNull();
    expect(verifiedEmail({ email: "zz308@example.com" })).toBeNull();
  });

  it("looks nothing up without an address", () => {
    expect(verifiedEmail({ email: "", email_confirmed_at: "2026-09-23T10:00:00Z" })).toBeNull();
    expect(verifiedEmail({ email_confirmed_at: "2026-09-23T10:00:00Z" })).toBeNull();
  });
});

describe("newestLiveInvite", () => {
  it("takes the newest when several wait", () => {
    expect(newestLiveInvite([OLDER, NEWER], NOW)).toBe(NEWER);
    expect(newestLiveInvite([NEWER, OLDER], NOW)).toBe(NEWER);
  });

  it("passes over one that has run out, however new", () => {
    expect(newestLiveInvite([LAPSED, OLDER], NOW)).toBe(OLDER);
    expect(newestLiveInvite([LAPSED], NOW)).toBeNull();
  });

  it("runs one out at its expiry, as invite_preview does", () => {
    const atNow = invite("at-now", "2026-09-22T12:00:00Z", NOW.toISOString());
    expect(newestLiveInvite([atNow], NOW)).toBeNull();
  });

  it("never runs out one with no expiry", () => {
    const open = invite("open", "2025-01-01T00:00:00Z", null);
    expect(newestLiveInvite([open], NOW)).toBe(open);
  });

  it("finds none in none", () => {
    expect(newestLiveInvite([], NOW)).toBeNull();
  });
});

describe("firstTimerStep (Step 30.8)", () => {
  it("opens an invite emailed to their address, the newest if several", () => {
    expect(
      firstTimerStep({
        invites: [OLDER, NEWER],
        requestedTree: "Zz308 Tree",
        waitlisted: true,
        now: NOW,
      }),
    ).toEqual({ kind: "invite", href: "/join/newer" });
  });

  it("says where their request stands when no invite is waiting", () => {
    expect(
      firstTimerStep({ invites: [LAPSED], requestedTree: "Zz308 Tree", waitlisted: false, now: NOW }),
    ).toEqual({ kind: "requested", treeName: "Zz308 Tree" });
  });

  it("offers request access when nothing is waiting", () => {
    expect(
      firstTimerStep({ invites: [], requestedTree: null, waitlisted: false, now: NOW }),
    ).toEqual({ kind: "ask", waitlisted: false });
  });

  it("still offers request access to someone on the waitlist, saying so", () => {
    expect(
      firstTimerStep({ invites: [], requestedTree: null, waitlisted: true, now: NOW }),
    ).toEqual({ kind: "ask", waitlisted: true });
  });
});
