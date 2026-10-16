import { describe, expect, it } from "vitest";

import {
  readSentCode,
  SENT_CODE_SECONDS,
  sentCodeCookieOptions,
  sentCodeCookieValue,
  type SentCode,
} from "@/lib/sent-code";

const NOW = Date.UTC(2026, 9, 16, 12);

const signUp: SentCode = {
  email: "leila@example.com",
  firstName: "Leila",
  lastName: "Haddad",
  campaign: "df9590fa4260",
  sentAt: NOW - 5 * 60 * 1000,
};

describe("the sent code's cookie", () => {
  it("lasts as long as the code, httpOnly", () => {
    expect(SENT_CODE_SECONDS).toBe(3600);
    expect(sentCodeCookieOptions()).toMatchObject({
      maxAge: 3600,
      httpOnly: true,
      path: "/",
    });
  });

  it("comes back on the same link within the hour", () => {
    const raw = sentCodeCookieValue(signUp);
    expect(readSentCode(raw, { campaign: "df9590fa4260" }, NOW)).toEqual(signUp);
  });

  it("opens only the page it was sent from", () => {
    const raw = sentCodeCookieValue(signUp);
    // Plain sign-in on /join, another campaign, a bare invite link.
    expect(readSentCode(raw, {}, NOW)).toBeNull();
    expect(readSentCode(raw, { campaign: "aaaaaaaaaaaa" }, NOW)).toBeNull();
    expect(readSentCode(raw, { inviteToken: "tok" }, NOW)).toBeNull();

    const plain = sentCodeCookieValue({ email: "a@example.com", sentAt: NOW });
    expect(readSentCode(plain, {}, NOW)?.email).toBe("a@example.com");
    expect(readSentCode(plain, { campaign: "df9590fa4260" }, NOW)).toBeNull();
  });

  it("opens an emailed invite's box only for the address it names", () => {
    const sent: SentCode = { email: "leila@example.com", inviteToken: "tok", sentAt: NOW };
    const raw = sentCodeCookieValue(sent);
    expect(readSentCode(raw, { inviteToken: "tok", email: "Leila@Example.com " }, NOW)).toEqual(
      sent,
    );
    expect(readSentCode(raw, { inviteToken: "tok", email: "sami@example.com" }, NOW)).toBeNull();
    expect(readSentCode(raw, { inviteToken: "other", email: "leila@example.com" }, NOW)).toBeNull();
  });

  it("is spent after an hour", () => {
    const raw = sentCodeCookieValue({ ...signUp, sentAt: NOW - 3600 * 1000 });
    expect(readSentCode(raw, { campaign: "df9590fa4260" }, NOW)).toBeNull();
  });

  it("ignores anything malformed", () => {
    expect(readSentCode(undefined, {}, NOW)).toBeNull();
    expect(readSentCode("", {}, NOW)).toBeNull();
    expect(readSentCode("not json", {}, NOW)).toBeNull();
    expect(readSentCode("[]", {}, NOW)).toBeNull();
    expect(readSentCode(JSON.stringify({ email: "nope", sentAt: NOW }), {}, NOW)).toBeNull();
    expect(readSentCode(JSON.stringify({ email: "a@example.com" }), {}, NOW)).toBeNull();
    expect(
      readSentCode(JSON.stringify({ email: "a@example.com", sentAt: "soon" }), {}, NOW),
    ).toBeNull();
  });
});
