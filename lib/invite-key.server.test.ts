import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { inviteKey, isInviteKey } from "@/lib/invite-key.server";

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";
});

describe("an emailed invite's key (audit H3)", () => {
  it("is the same for a token each time, and safe in a URL", () => {
    expect(inviteKey("tok")).toBe(inviteKey("tok"));
    expect(inviteKey("tok")).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("differs by token and by the server's secret", () => {
    const key = inviteKey("tok");
    expect(inviteKey("tok2")).not.toBe(key);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "another-secret";
    expect(inviteKey("tok")).not.toBe(key);
  });

  it("accepts only its own invite's key", () => {
    expect(isInviteKey("tok", inviteKey("tok"))).toBe(true);
    expect(isInviteKey("tok", inviteKey("tok2"))).toBe(false);
    expect(isInviteKey("tok", "")).toBe(false);
    expect(isInviteKey("tok", null)).toBe(false);
    expect(isInviteKey("tok", undefined)).toBe(false);
    expect(isInviteKey("tok", "short")).toBe(false);
    expect(isInviteKey("", inviteKey(""))).toBe(false);
  });
});
