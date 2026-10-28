import { describe, expect, it } from "vitest";

import { alertRecipients } from "@/lib/request-alerts";
import { isEmailAddress } from "@/lib/email-address";
import { verifiedEmail } from "@/lib/first-timer";
import {
  asksForEmail,
  EMAIL_ASKED_KEY,
  isNoEmailAddress,
  NO_EMAIL_DOMAIN,
  noEmailAddress,
  noEmailMayJoin,
  reachableEmail,
  shownEmail,
  type NoEmailInvite,
} from "@/lib/no-email";

const placeholder = noEmailAddress("6f1c2d3e-0000-4000-8000-000000000000");

describe("no-email addresses (Step 202)", () => {
  it("makes one at the domain with no mail server", () => {
    expect(placeholder).toBe(`6f1c2d3e-0000-4000-8000-000000000000@${NO_EMAIL_DOMAIN}`);
  });

  it("keeps the x@y.z shape people_email_shape checks", () => {
    expect(placeholder).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  it("tells one from a real inbox, in any case", () => {
    expect(isNoEmailAddress(placeholder)).toBe(true);
    expect(isNoEmailAddress(placeholder.toUpperCase())).toBe(true);
    expect(isNoEmailAddress(` ${placeholder} `)).toBe(true);
    expect(isNoEmailAddress("aunt@example.com")).toBe(false);
    expect(isNoEmailAddress("someone@ancestree.space")).toBe(false);
    expect(isNoEmailAddress(null)).toBe(false);
    expect(isNoEmailAddress(undefined)).toBe(false);
  });

  it("is never reachable or shown", () => {
    expect(reachableEmail(placeholder)).toBeNull();
    expect(reachableEmail(" aunt@example.com ")).toBe("aunt@example.com");
    expect(reachableEmail("")).toBeNull();
    expect(shownEmail(placeholder)).toBe("No email");
    expect(shownEmail("aunt@example.com")).toBe("aunt@example.com");
  });

  it("isn't taken as a typed address", () => {
    expect(isEmailAddress(placeholder)).toBe(false);
    expect(isEmailAddress("aunt@example.com")).toBe(true);
  });

  it("isn't a verified address to look invites up by", () => {
    const at = "2026-10-22T00:00:00Z";
    expect(verifiedEmail({ email: placeholder, email_confirmed_at: at })).toBeNull();
    expect(verifiedEmail({ email: "Aunt@Example.com", email_confirmed_at: at })).toBe(
      "aunt@example.com",
    );
  });

  it("is never alerted", () => {
    expect(alertRecipients([placeholder, "root@example.com"])).toEqual(["root@example.com"]);
  });
});

describe("who may join with no email (Step 202)", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  const claimLink: NoEmailInvite = {
    status: "active",
    expires_at: "2026-11-21T12:00:00Z",
    archived_at: null,
    invited_email: null,
    founds_tree: false,
    person_id: "11111111-1111-4111-8111-111111111111",
    max_uses: null,
    use_count: 0,
  };
  const familyLink: NoEmailInvite = {
    ...claimLink,
    expires_at: null,
    person_id: null,
    max_uses: 20,
    use_count: 3,
  };

  it("takes a live claim link or family link", () => {
    expect(noEmailMayJoin(claimLink, now)).toBe(true);
    expect(noEmailMayJoin(familyLink, now)).toBe(true);
  });

  it("refuses an invite bound to an address, or one that founds a tree", () => {
    expect(noEmailMayJoin({ ...claimLink, invited_email: "aunt@example.com" }, now)).toBe(false);
    expect(noEmailMayJoin({ ...claimLink, person_id: null, founds_tree: true }, now)).toBe(false);
  });

  it("refuses a bare link that's neither", () => {
    expect(noEmailMayJoin({ ...claimLink, person_id: null }, now)).toBe(false);
  });

  it("refuses one that's spent, archived, expired or full", () => {
    expect(noEmailMayJoin(null, now)).toBe(false);
    expect(noEmailMayJoin({ ...claimLink, status: "revoked" }, now)).toBe(false);
    expect(noEmailMayJoin({ ...claimLink, archived_at: "2026-10-01T00:00:00Z" }, now)).toBe(false);
    expect(noEmailMayJoin({ ...claimLink, expires_at: "2026-10-22T11:59:59Z" }, now)).toBe(false);
    expect(noEmailMayJoin({ ...familyLink, use_count: 20 }, now)).toBe(false);
  });
});

describe("asking for an email after joining (Step 213)", () => {
  it("asks an account with no email that hasn't closed the ask", () => {
    expect(asksForEmail(placeholder, {})).toBe(true);
    expect(asksForEmail(placeholder, null)).toBe(true);
    expect(asksForEmail(placeholder, { first_name: "Amina", last_name: "Okafor" })).toBe(true);
  });

  it("asks once: not after it's closed", () => {
    expect(asksForEmail(placeholder, { [EMAIL_ASKED_KEY]: "2026-10-27T12:00:00Z" })).toBe(false);
  });

  it("never asks an account with an email", () => {
    expect(asksForEmail("aunt@example.com", {})).toBe(false);
    expect(asksForEmail(null, {})).toBe(false);
  });
});
