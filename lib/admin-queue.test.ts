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

const queue = (treeId: string, inviteRequests = 0, reports = 0): TreeQueue => ({
  treeId,
  inviteRequests,
  reports,
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
    const href = openConsoleHref("reports");
    expect(href).toBe("/account/admin?section=reports");
    const url = new URL(href, "https://www.ancestree.space");
    expect(readOpenConsole(url.searchParams)).toEqual({
      treeId: null,
      section: "reports",
    });
  });

  it("no longer knows requests to start a tree, which are the admin page's", () => {
    expect(
      readOpenConsole(new URLSearchParams("section=tree-requests")).section,
    ).toBeNull();
  });

  it("opens a tree's console at its top when no card is named", () => {
    const href = openConsoleHref(null, A);
    expect(href).toBe(`/account/admin?tree=${A}`);
    const url = new URL(href, "https://www.ancestree.space");
    expect(readOpenConsole(url.searchParams)).toEqual({
      treeId: A,
      section: null,
    });
  });

  it("drops a tree that isn't an id and a card that isn't a queue", () => {
    expect(
      readOpenConsole(
        new URLSearchParams("tree=not-a-uuid&section=members"),
      ),
    ).toEqual({ treeId: null, section: null });
    expect(
      readOpenConsole(new URLSearchParams(`tree=${A}'--&section=reports`)),
    ).toEqual({ treeId: null, section: "reports" });
  });

  it("lands on the console's own address for the card", () => {
    expect(adminHref("invite-requests")).toBe("/account?view=admin#invite-requests");
  });
});

describe("isQueueSection", () => {
  it("knows the cards the console's Needs attention list points at", () => {
    const targets = buildAdminActionItems({
      inviteRequests: 1,
      reports: 1,
    }).map((i) => i.target);
    expect(targets.every(isQueueSection)).toBe(true);
    expect(isQueueSection("share")).toBe(false);
    expect(isQueueSection(undefined)).toBe(false);
  });
});

describe("pickQueueTarget", () => {
  it("is nothing when nothing waits", () => {
    expect(
      pickQueueTarget({ trees: [queue(A), queue(B)], currentTreeId: A }),
    ).toBeNull();
    expect(pickQueueTarget({ trees: [], currentTreeId: null })).toBeNull();
  });

  it("opens the tree being looked at when something waits there", () => {
    expect(
      pickQueueTarget({
        trees: [queue(A, 1), queue(B, 2)],
        currentTreeId: B,
      }),
    ).toEqual({ treeId: B, section: "invite-requests" });
  });

  it("goes to the first tree with something waiting, not the one being looked at", () => {
    expect(
      pickQueueTarget({
        trees: [queue(A), queue(B, 0, 1)],
        currentTreeId: A,
      }),
    ).toEqual({ treeId: B, section: "reports" });
  });

  it("goes there too from a tree they only visit or don't run", () => {
    expect(
      pickQueueTarget({
        trees: [queue(A), queue(B, 3)],
        currentTreeId: "33333333-3333-4333-8333-333333333333",
      }),
    ).toEqual({ treeId: B, section: "invite-requests" });
  });

  it("puts requests for access before reports", () => {
    expect(
      pickQueueTarget({ trees: [queue(A, 1, 4)], currentTreeId: A }),
    ).toEqual({ treeId: A, section: "invite-requests" });
  });
});

describe("queueCountLabel", () => {
  it("reads as a sentence, singular and plural", () => {
    expect(queueCountLabel(1)).toBe("1 needs attention in the Root console");
    expect(queueCountLabel(4)).toBe("4 need attention in the Root console");
  });
});
