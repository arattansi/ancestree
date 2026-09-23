import { describe, expect, it, vi } from "vitest";

import {
  isQueueSection,
  openConsoleHref,
  pickQueueTarget,
  queueCountLabel,
  readOpenConsole,
  type TreeQueue,
} from "@/lib/admin-queue";
import { buildAdminActionItems } from "@/lib/admin-notifications";
import { adminHref } from "@/lib/tree-links";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const queue = (treeId: string, inviteRequests = 0, disputedClaims = 0): TreeQueue => ({
  treeId,
  inviteRequests,
  disputedClaims,
});

describe("openConsoleHref / readOpenConsole", () => {
  it("names the tree and the card, and reads them back", () => {
    const href = openConsoleHref("invite-requests", A);
    expect(href).toBe(`/account/admin?tree=${A}&section=invite-requests`);
    const url = new URL(href, "https://www.ancestree.space");
    expect(readOpenConsole(url.searchParams)).toEqual({
      treeId: A,
      section: "invite-requests",
    });
  });

  it("leaves the tree out when the alert isn't about one", () => {
    const href = openConsoleHref("tree-requests");
    expect(href).toBe("/account/admin?section=tree-requests");
    const url = new URL(href, "https://www.ancestree.space");
    expect(readOpenConsole(url.searchParams)).toEqual({
      treeId: null,
      section: "tree-requests",
    });
  });

  it("drops a tree that isn't an id and a card that isn't a queue", () => {
    expect(
      readOpenConsole(
        new URLSearchParams("tree=not-a-uuid&section=members"),
      ),
    ).toEqual({ treeId: null, section: null });
    expect(
      readOpenConsole(new URLSearchParams(`tree=${A}'--&section=disputes`)),
    ).toEqual({ treeId: null, section: "disputes" });
  });

  it("lands on the console's own address for the card", () => {
    expect(adminHref("invite-requests")).toBe("/account?view=admin#invite-requests");
  });
});

describe("isQueueSection", () => {
  it("knows the cards the console's Needs attention list points at", () => {
    const targets = buildAdminActionItems({
      inviteRequests: 1,
      disputedClaims: 1,
      treeRequests: 1,
    }).map((i) => i.target);
    expect(targets.every(isQueueSection)).toBe(true);
    expect(isQueueSection("share")).toBe(false);
    expect(isQueueSection(undefined)).toBe(false);
  });
});

describe("pickQueueTarget", () => {
  it("is nothing when nothing waits", () => {
    expect(
      pickQueueTarget({ trees: [queue(A), queue(B)], treeRequests: 0, currentTreeId: A }),
    ).toBeNull();
    expect(pickQueueTarget({ trees: [], treeRequests: 0, currentTreeId: null })).toBeNull();
  });

  it("opens the tree being looked at when something waits there", () => {
    expect(
      pickQueueTarget({
        trees: [queue(A, 1), queue(B, 2)],
        treeRequests: 0,
        currentTreeId: B,
      }),
    ).toEqual({ treeId: B, section: "invite-requests" });
  });

  it("goes to the first tree with something waiting, not the one being looked at", () => {
    expect(
      pickQueueTarget({
        trees: [queue(A), queue(B, 0, 1)],
        treeRequests: 0,
        currentTreeId: A,
      }),
    ).toEqual({ treeId: B, section: "disputes" });
  });

  it("goes there too from a tree they only visit or don't run", () => {
    expect(
      pickQueueTarget({
        trees: [queue(A), queue(B, 3)],
        treeRequests: 0,
        currentTreeId: "33333333-3333-4333-8333-333333333333",
      }),
    ).toEqual({ treeId: B, section: "invite-requests" });
  });

  it("puts requests for access before disputes", () => {
    expect(
      pickQueueTarget({ trees: [queue(A, 1, 4)], treeRequests: 2, currentTreeId: A }),
    ).toEqual({ treeId: A, section: "invite-requests" });
  });

  it("shows requests to start a tree on the console being looked at", () => {
    expect(
      pickQueueTarget({ trees: [queue(A), queue(B)], treeRequests: 1, currentTreeId: B }),
    ).toEqual({ treeId: B, section: "tree-requests" });
  });

  it("shows them on the first tree they run when they're looking elsewhere", () => {
    expect(
      pickQueueTarget({ trees: [queue(A), queue(B)], treeRequests: 1, currentTreeId: null }),
    ).toEqual({ treeId: A, section: "tree-requests" });
  });

  it("lets a tree's own queue come before requests to start a tree elsewhere", () => {
    expect(
      pickQueueTarget({
        trees: [queue(A), queue(B, 1)],
        treeRequests: 1,
        currentTreeId: "33333333-3333-4333-8333-333333333333",
      }),
    ).toEqual({ treeId: B, section: "invite-requests" });
  });
});

describe("queueCountLabel", () => {
  it("reads as a sentence, singular and plural", () => {
    expect(queueCountLabel(1)).toBe("1 needs attention in admin");
    expect(queueCountLabel(4)).toBe("4 need attention in admin");
  });
});
