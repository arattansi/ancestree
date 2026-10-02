import { describe, expect, it } from "vitest";

import {
  COUNTS_FRESH_MS,
  countsStale,
  parseHeaderCounts,
  unreadShown,
} from "@/lib/header-counts";

describe("header counts (Step 77.2)", () => {
  it("asks again only once the counts are 30 s old", () => {
    expect(countsStale(1_000, 1_000 + COUNTS_FRESH_MS - 1)).toBe(false);
    expect(countsStale(1_000, 1_000 + COUNTS_FRESH_MS)).toBe(true);
    // Never read yet.
    expect(countsStale(0, Date.now())).toBe(true);
  });

  it("shows the unread count until they've looked past the newest", () => {
    const counts = { unread: 3, latestUnreadAt: 5_000 };
    expect(unreadShown(counts, 0)).toBe(3);
    expect(unreadShown(counts, 4_999)).toBe(3);
    // Opened the bell, or read a list that marked them read, after it came.
    expect(unreadShown(counts, 5_000)).toBe(0);
    // Something new since.
    expect(unreadShown({ unread: 1, latestUnreadAt: 6_000 }, 5_000)).toBe(1);
    expect(unreadShown({ unread: 0, latestUnreadAt: 0 }, 0)).toBe(0);
  });

  it("takes only counts from the server's answer", () => {
    const admin = {
      count: 2,
      treeId: "t1",
      href: "/account?view=admin#invite-requests",
      label: "2 need attention in the Root console",
    };
    expect(
      parseHeaderCounts({
        unread: 1,
        latestUnreadAt: 9,
        connections: 0,
        currentTreeId: "t1",
        treeRequests: 2,
        admin,
      }),
    ).toEqual({
      unread: 1,
      latestUnreadAt: 9,
      connections: 0,
      currentTreeId: "t1",
      treeRequests: 2,
      admin,
    });
    // A visitor, or someone on no tree: no tree of theirs is being looked at.
    expect(
      parseHeaderCounts({ unread: 1, latestUnreadAt: 9, connections: 4, admin: null }),
    ).toEqual({
      unread: 1,
      latestUnreadAt: 9,
      connections: 4,
      currentTreeId: null,
      // Not a beta reviewer: no **admin** link.
      treeRequests: null,
      admin: null,
    });
    // A half-formed queue is no queue.
    expect(
      parseHeaderCounts({
        unread: 0,
        latestUnreadAt: 0,
        connections: 0,
        admin: { count: 2 },
      })?.admin,
    ).toBeNull();
    for (const bad of [null, "x", { error: "Sign in to see this." }, { unread: "3" }]) {
      expect(parseHeaderCounts(bad)).toBeNull();
    }
  });
});
