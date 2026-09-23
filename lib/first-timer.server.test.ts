import { beforeEach, describe, expect, it, vi } from "vitest";

// The loaders with the service-role client stubbed (Step 30.8): each table
// answers with the rows set for it, and every query's filters are kept, to
// check that nothing is looked up by anything but the address given.
type Filter = [op: "eq" | "is", column: string, value: unknown];
type Query = { table: string; columns: string; filters: Filter[] };
let queries: Query[];
let rows: Record<string, unknown>;

function query(table: string) {
  const q: Query = { table, columns: "", filters: [] };
  queries.push(q);
  const reply = (fallback: unknown) => ({ data: rows[table] ?? fallback, error: null });
  const builder = {
    select(columns: string) {
      q.columns = columns;
      return builder;
    },
    eq(column: string, value: unknown) {
      q.filters.push(["eq", column, value]);
      return builder;
    },
    is(column: string, value: unknown) {
      q.filters.push(["is", column, value]);
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => reply(null),
    then<T>(resolve: (value: { data: unknown; error: null }) => T) {
      return Promise.resolve(reply([])).then(resolve);
    },
  };
  return builder;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => query(table) }),
}));

import { loadFirstTimerStep, waitingInviteHref } from "@/lib/first-timer.server";

const ADDRESS = "delivered+30-8-test@resend.dev";
const LIVE = {
  token: "live",
  created_at: "2026-09-20T09:00:00Z",
  expires_at: "2099-01-01T00:00:00Z",
};
const LAPSED = {
  token: "lapsed",
  created_at: "2026-09-21T09:00:00Z",
  expires_at: "2026-09-22T09:00:00Z",
};

beforeEach(() => {
  queries = [];
  rows = {};
});

describe("waitingInviteHref", () => {
  it("finds the live invite bound to the address", async () => {
    rows.invites = [LAPSED, LIVE];
    await expect(waitingInviteHref(ADDRESS)).resolves.toBe("/join/live");
    expect(queries).toEqual([
      {
        table: "invites",
        columns: "token, created_at, expires_at",
        filters: [
          ["eq", "invited_email", ADDRESS],
          ["eq", "status", "active"],
          ["is", "archived_at", null],
        ],
      },
    ]);
  });

  it("finds none when every one has run out", async () => {
    rows.invites = [LAPSED];
    await expect(waitingInviteHref(ADDRESS)).resolves.toBeNull();
  });
});

describe("loadFirstTimerStep", () => {
  it("looks everything up by the address alone", async () => {
    await loadFirstTimerStep(ADDRESS);
    const byTable = Object.fromEntries(queries.map((q) => [q.table, q.filters]));
    expect(byTable).toEqual({
      invites: [
        ["eq", "invited_email", ADDRESS],
        ["eq", "status", "active"],
        ["is", "archived_at", null],
      ],
      invite_requests: [
        ["eq", "email", ADDRESS],
        ["eq", "status", "pending"],
      ],
      tree_requests: [
        ["eq", "email", ADDRESS],
        ["eq", "status", "pending"],
        ["is", "user_id", null],
      ],
    });
  });

  it("opens a live invite before anything else", async () => {
    rows.invites = [LIVE];
    rows.invite_requests = { trees: { name: "Zz308 Tree" } };
    await expect(loadFirstTimerStep(ADDRESS)).resolves.toEqual({
      kind: "invite",
      href: "/join/live",
    });
  });

  it("names the tree a pending request waits on", async () => {
    rows.invite_requests = { trees: { name: "Zz308 Tree" } };
    await expect(loadFirstTimerStep(ADDRESS)).resolves.toEqual({
      kind: "requested",
      treeName: "Zz308 Tree",
    });
  });

  it("reads the tree when PostgREST hands it back as a list", async () => {
    rows.invite_requests = { trees: [{ name: "Zz308 Tree" }] };
    await expect(loadFirstTimerStep(ADDRESS)).resolves.toEqual({
      kind: "requested",
      treeName: "Zz308 Tree",
    });
  });

  it("offers request access, saying when they're on the waitlist", async () => {
    await expect(loadFirstTimerStep(ADDRESS)).resolves.toEqual({
      kind: "ask",
      waitlisted: false,
    });
    rows.tree_requests = { id: "w1" };
    await expect(loadFirstTimerStep(ADDRESS)).resolves.toEqual({
      kind: "ask",
      waitlisted: true,
    });
  });
});
