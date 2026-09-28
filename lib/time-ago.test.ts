import { describe, expect, it } from "vitest";

import { timeAgo } from "@/lib/time-ago";

describe("timeAgo", () => {
  const now = Date.parse("2026-09-28T12:00:00Z");
  const ago = (ms: number) => timeAgo(new Date(now - ms).toISOString(), now);

  it("says how long ago, in minutes, hours or days", () => {
    expect(ago(20_000)).toBe("just now");
    expect(ago(5 * 60_000)).toBe("5m ago");
    expect(ago(3 * 3_600_000)).toBe("3h ago");
    expect(ago(2 * 86_400_000)).toBe("2d ago");
  });
});
