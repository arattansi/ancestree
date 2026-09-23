import { beforeEach, describe, expect, it, vi } from "vitest";

// resolveShareLink with its two dependencies stubbed: Next's `after`, which
// here only collects the task, and the service-role client.
const afterTasks: (() => unknown)[] = [];
let admin: ReturnType<typeof fakeAdmin>;

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  after: (task: () => unknown) => afterTasks.push(task),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => admin.client,
}));

import { resolveShareLink } from "@/lib/share-links.server";

type Row = Record<string, unknown> | null;
type RpcError = { message: string } | null;

/**
 * A stand-in for the service-role client: each table answers with one row.
 * Its RPC is lazy like a real Supabase query, sent only once awaited, so a
 * call that is built and never awaited never shows up in `sent`.
 */
function fakeAdmin(
  rows: { share_links: Row; trees: Row },
  rpcError: RpcError = null,
) {
  const sent: { fn: string; args: unknown }[] = [];
  const client = {
    from: (table: keyof typeof rows) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: rows[table], error: null }),
        }),
      }),
    }),
    rpc: (
      fn: string,
      args: unknown,
    ): PromiseLike<{ data: null; error: RpcError }> => ({
      then(onFulfilled, onRejected) {
        sent.push({ fn, args });
        return Promise.resolve({ data: null, error: rpcError }).then(
          onFulfilled,
          onRejected,
        );
      },
    }),
  };
  return { client, sent };
}

const TOKEN = "0123456789abcdef".repeat(4);
const LINK = {
  id: "l1",
  token: TOKEN,
  tree_id: "t1",
  revoked_at: null,
  expires_at: null,
};
const TREE = { id: "t1", name: "Test tree" };
// A relative opening the link, and iMessage drawing its preview (Step 33.7).
const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IMESSAGE_PREVIEW =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0";

/** Run what the page handed to `after`, as Next does once the response is out. */
async function afterResponse() {
  for (const task of afterTasks.splice(0)) await task();
}

describe("resolveShareLink (Step 33)", () => {
  beforeEach(() => {
    afterTasks.length = 0;
    admin = fakeAdmin({ share_links: LINK, trees: TREE });
  });

  it("returns the tree, then counts the view once the page has gone out", async () => {
    expect(await resolveShareLink(TOKEN, SAFARI)).toEqual({
      id: "l1",
      token: TOKEN,
      treeId: "t1",
      treeName: "Test tree",
    });
    // Nothing is sent while the page renders…
    expect(admin.sent).toEqual([]);
    expect(afterTasks).toHaveLength(1);

    // …and afterwards the database is asked to add one: sent, not just built.
    await afterResponse();
    expect(admin.sent).toEqual([
      { fn: "record_share_link_view", args: { p_link_id: "l1" } },
    ]);
  });

  it("counts no view of an unknown, revoked or expired link", async () => {
    for (const link of [
      null,
      { ...LINK, revoked_at: "2026-09-01T00:00:00Z" },
      { ...LINK, expires_at: "2000-01-01T00:00:00Z" },
    ]) {
      admin = fakeAdmin({ share_links: link, trees: TREE });
      expect(await resolveShareLink(TOKEN, SAFARI)).toBeNull();
    }
    expect(afterTasks).toEqual([]);
  });

  it("gives a link preview the tree, but counts no view", async () => {
    expect(await resolveShareLink(TOKEN, IMESSAGE_PREVIEW)).not.toBeNull();
    expect(await resolveShareLink(TOKEN, null)).not.toBeNull();
    expect(afterTasks).toEqual([]);
    expect(admin.sent).toEqual([]);
  });

  it("counts no view when the tree is gone", async () => {
    admin = fakeAdmin({ share_links: LINK, trees: null });
    expect(await resolveShareLink(TOKEN, SAFARI)).toBeNull();
    expect(afterTasks).toEqual([]);
  });

  it("warns when the count fails, never with the token, and still shows the tree", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    admin = fakeAdmin(
      { share_links: LINK, trees: TREE },
      { message: "permission denied for function record_share_link_view" },
    );

    expect(await resolveShareLink(TOKEN, SAFARI)).not.toBeNull();
    await afterResponse();

    expect(admin.sent).toHaveLength(1);
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN);
    warn.mockRestore();
  });
});
