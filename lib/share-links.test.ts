import { describe, expect, it } from "vitest";

import { isShareLinkUsable, shareLinkState } from "@/lib/share-links";

const now = new Date("2026-08-31T12:00:00Z");

describe("isShareLinkUsable", () => {
  it("is usable with no revoke and no expiry", () => {
    expect(isShareLinkUsable({ revoked_at: null, expires_at: null }, now)).toBe(
      true,
    );
  });

  it("is usable when expiry is in the future", () => {
    expect(
      isShareLinkUsable(
        { revoked_at: null, expires_at: "2026-09-30T00:00:00Z" },
        now,
      ),
    ).toBe(true);
  });

  it("is not usable once revoked", () => {
    expect(
      isShareLinkUsable(
        { revoked_at: "2026-08-01T00:00:00Z", expires_at: null },
        now,
      ),
    ).toBe(false);
  });

  it("is not usable once expired", () => {
    expect(
      isShareLinkUsable(
        { revoked_at: null, expires_at: "2026-08-30T00:00:00Z" },
        now,
      ),
    ).toBe(false);
  });
});

describe("shareLinkState", () => {
  it("labels active / revoked / expired", () => {
    expect(
      shareLinkState({ revoked_at: null, expires_at: null }, now),
    ).toBe("active");
    expect(
      shareLinkState({ revoked_at: "2026-08-01T00:00:00Z", expires_at: null }, now),
    ).toBe("revoked");
    expect(
      shareLinkState({ revoked_at: null, expires_at: "2026-01-01T00:00:00Z" }, now),
    ).toBe("expired");
  });
});
