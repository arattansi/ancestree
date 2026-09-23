import { describe, expect, it } from "vitest";

import { sameOriginPath } from "@/lib/safe-next";
import { inviteHref, PENDING_HREF, signInCallbackUrl } from "@/lib/sign-in-links";

const SITE = "https://www.ancestree.space";
const TOKEN = "9f8e7d6c5b4a39281706f5e4d3c2b1a0";

describe("inviteHref", () => {
  it("is the invite's own page", () => {
    expect(inviteHref(TOKEN)).toBe(`/join/${TOKEN}`);
  });

  it("keeps whatever it's given inside the one path segment", () => {
    expect(inviteHref("a/../b?c")).toBe("/join/a%2F..%2Fb%3Fc");
  });

  it("is a `next` that signing in accepts back (Step 30.1)", () => {
    expect(sameOriginPath(inviteHref(TOKEN))).toBe(inviteHref(TOKEN));
  });
});

describe("signInCallbackUrl", () => {
  it("carries where a plain sign-in lands", () => {
    const url = new URL(signInCallbackUrl(SITE, { next: "/tree" }));
    expect(url.origin + url.pathname).toBe(`${SITE}/auth/callback`);
    expect([...url.searchParams]).toEqual([["next", "/tree"]]);
  });

  it("carries a bare invite link's invite beside it", () => {
    const url = new URL(signInCallbackUrl(SITE, { next: "/tree", invite: TOKEN }));
    expect(url.searchParams.get("next")).toBe("/tree");
    expect(url.searchParams.get("invite")).toBe(TOKEN);
  });

  it("brings an existing member back to the invite they opened (Step 30.8)", () => {
    const url = new URL(signInCallbackUrl(SITE, { next: inviteHref(TOKEN) }));
    expect(url.searchParams.get("next")).toBe(`/join/${TOKEN}`);
    expect(url.searchParams.has("invite")).toBe(false);
  });

  it("leaves no invite for an empty one", () => {
    const url = new URL(signInCallbackUrl(SITE, { next: "/tree", invite: "" }));
    expect(url.searchParams.has("invite")).toBe(false);
  });

  it("takes the token the email template adds after it with &", () => {
    // `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`
    const link = `${signInCallbackUrl(SITE, { next: inviteHref(TOKEN) })}&token_hash=abc&type=email`;
    const url = new URL(link);
    expect(url.searchParams.get("next")).toBe(`/join/${TOKEN}`);
    expect(url.searchParams.get("token_hash")).toBe("abc");
    expect(url.searchParams.get("type")).toBe("email");
  });
});

describe("PENDING_HREF", () => {
  it("is /join, for someone signed in who isn't a member yet", () => {
    expect(new URL(PENDING_HREF, SITE).pathname).toBe("/join");
  });
});
