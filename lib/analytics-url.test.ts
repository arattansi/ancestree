import { describe, expect, it } from "vitest";

import { redactedPath, redactedSearch, redactedUrl } from "@/lib/analytics-url";

const SITE = "https://www.ancestree.space";
const TOKEN = "Qx7_pZ2kLm9vR4tY8wE1aB3c";

describe("redactedUrl", () => {
  it("replaces the token in every token route", () => {
    const routes: [string, string][] = [
      [`/join/${TOKEN}`, "/join/:token"],
      [`/newsletter/${TOKEN}`, "/newsletter/:token"],
      [`/getting-started/${TOKEN}`, "/getting-started/:token"],
      [`/message-emails/${TOKEN}`, "/message-emails/:token"],
      [`/shared/${TOKEN}`, "/shared/:token"],
      [`/shared/${TOKEN}/ancestral-lands`, "/shared/:token/ancestral-lands"],
      [`/shared/story/${TOKEN}`, "/shared/story/:token"],
      [`/library/subscription/${TOKEN}`, "/library/subscription/:token"],
      [`/library/submissions/${TOKEN}`, "/library/submissions/:token"],
    ];
    for (const [path, seen] of routes) {
      expect(redactedUrl(`${SITE}${path}`), path).toBe(`${SITE}${seen}`);
    }
  });

  it("leaves addresses without a token as they are", () => {
    for (const path of [
      "/",
      "/join",
      "/join?status=pending",
      "/family?person=5f0c6a7e-0d1b-4c43-9a55-1d2b3c4d5e6f",
      "/library",
      "/library/an-arrangement-honoured",
      "/library/submit",
      "/start/df9590fa4260",
      "/privacy",
    ]) {
      expect(redactedUrl(`${SITE}${path}`), path).toBe(`${SITE}${path}`);
    }
  });

  it("drops a sign-in email's token and invite, and redacts where it lands", () => {
    expect(
      redactedUrl(
        `${SITE}/auth/confirm?token_hash=pkce_8f2e1c&type=magiclink&invite=${TOKEN}&next=%2Fjoin%2F${TOKEN}`,
      ),
    ).toBe(`${SITE}/auth/confirm?type=magiclink&next=%2Fjoin%2F%3Atoken`);
    expect(redactedUrl(`${SITE}/auth/confirm?token_hash=abc&type=email&next=/family`)).toBe(
      `${SITE}/auth/confirm?type=email&next=/family`,
    );
  });

  it("redacts a token in `next`, keeping its own query", () => {
    expect(
      redactedUrl(
        `${SITE}/join?next=${encodeURIComponent(`/getting-started/${TOKEN}?utm_source=email`)}`,
      ),
    ).toBe(
      `${SITE}/join?next=${encodeURIComponent("/getting-started/:token?utm_source=email")}`,
    );
    expect(
      redactedUrl(
        `${SITE}/join?next=${encodeURIComponent(`/auth/confirm?token_hash=abc&type=email`)}`,
      ),
    ).toBe(`${SITE}/join?next=${encodeURIComponent("/auth/confirm?type=email")}`);
  });

  it("keeps campaign tags exactly as written", () => {
    const tagged = `${SITE}/account?view=settings&utm_source=ancestree&utm_medium=email&utm_campaign=getting-started&utm_content=invite`;
    expect(redactedUrl(tagged)).toBe(tagged);
    expect(
      redactedUrl(
        `${SITE}/getting-started/${TOKEN}?utm_source=ancestree&utm_medium=email&utm_campaign=getting-started`,
      ),
    ).toBe(
      `${SITE}/getting-started/:token?utm_source=ancestree&utm_medium=email&utm_campaign=getting-started`,
    );
    expect(
      redactedUrl(`${SITE}/join?next=%2Ffamily&utm_source=ancestree&utm_content=a%20b`),
    ).toBe(`${SITE}/join?next=%2Ffamily&utm_source=ancestree&utm_content=a%20b`);
  });

  it("drops the fragment, which can hold a key", () => {
    expect(redactedUrl(`${SITE}/messages/link#${TOKEN}`)).toBe(`${SITE}/messages/link`);
    expect(redactedUrl(`${SITE}/#access_token=abc&refresh_token=def`)).toBe(`${SITE}/`);
    expect(redactedUrl(`${SITE}/account?view=settings#newsletter`)).toBe(
      `${SITE}/account?view=settings`,
    );
  });

  it("drops the codes and tokens Supabase's redirects carry", () => {
    expect(redactedUrl(`${SITE}/?code=0b6e2f`)).toBe(`${SITE}/`);
    expect(redactedUrl(`${SITE}/auth/callback?code=0b6e2f&next=%2Ffamily`)).toBe(
      `${SITE}/auth/callback?next=%2Ffamily`,
    );
  });

  it("redacts an address before ours, and leaves another site's alone", () => {
    expect(redactedUrl(`http://localhost:3000/join/${TOKEN}`)).toBe(
      "http://localhost:3000/join/:token",
    );
    expect(redactedUrl("https://www.google.com/")).toBe("https://www.google.com/");
    expect(redactedUrl("")).toBe("");
    expect(redactedUrl("android-app://com.google.android.gm/")).toBe("");
  });
});

describe("redactedPath and redactedSearch", () => {
  it("replace only the token's segment", () => {
    expect(redactedPath("/shared/story")).toBe("/shared/:token");
    expect(redactedPath(`/join/${TOKEN}/`)).toBe("/join/:token/");
    expect(redactedPath("/joined/abc")).toBe("/joined/abc");
  });

  it("keep a query with nothing secret in it", () => {
    expect(redactedSearch("")).toBe("");
    expect(redactedSearch("?token_hash=abc")).toBe("");
    expect(redactedSearch("?a=1&&b")).toBe("?a=1&b");
  });
});
