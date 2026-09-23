import { beforeEach, describe, expect, it, vi } from "vitest";

// Where accepting an invite lands (Step 30.2). The database decides whether a
// claim invite claimed its entry (`redeem_invite_tree`); these check that the
// app reads its answer and sends them to the right place. Stubbed: the tree
// cookie, the service-role client (the invite and the new account) and the
// cookie-bound client (verifying the token, redeeming).
const setCurrentTreeCookie = vi.fn();
let admin: ReturnType<typeof fakeAdmin>;
let server: ReturnType<typeof fakeServer>;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/current-tree.server", () => ({
  setCurrentTreeCookie: (treeId: string) => setCurrentTreeCookie(treeId),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => server }));

import {
  establishMembership,
  redeemInvite,
  signInWithInvite,
} from "@/lib/sign-in.server";

const TREE = { tree_id: "t1", tree_slug: "the-tree", tree_name: "The Tree" };

/** `redeem_invite_tree` as the database answers it. */
function redeemed(extra: Record<string, unknown>) {
  return { data: { ...TREE, ...extra }, error: null };
}

function fakeServer(rpc: { data: unknown; error: unknown }) {
  return {
    rpc: vi.fn(async () => rpc),
    auth: { verifyOtp: vi.fn(async () => ({ error: null })) },
  };
}

/** A live invite emailed to newcomer@example.com, and no account for them yet. */
function fakeAdmin({ hasProfile = false } = {}) {
  const invite = {
    status: "active",
    expires_at: null,
    invited_email: "newcomer@example.com",
    invite_requests: null,
  };
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              table === "invites"
                ? invite
                : hasProfile
                  ? { auth_user_id: "u1" }
                  : null,
          }),
        }),
      }),
    }),
    auth: {
      admin: {
        createUser: vi.fn(async () => ({ data: {}, error: null })),
        generateLink: vi.fn(async () => ({
          data: { user: { id: "u1" }, properties: { hashed_token: "hash" } },
          error: null,
        })),
      },
    },
  };
}

beforeEach(() => {
  setCurrentTreeCookie.mockReset();
  admin = fakeAdmin();
});

describe("redeemInvite", () => {
  it("reads whether their own entry is on the tree they joined", async () => {
    server = fakeServer(redeemed({ self_person_id: "p1", self_placed: true }));
    expect(await redeemInvite(server as never, "tok")).toEqual({
      treeId: "t1",
      treeSlug: "the-tree",
      treeName: "The Tree",
      selfPersonId: "p1",
      selfPlaced: true,
    });
    expect(setCurrentTreeCookie).toHaveBeenCalledWith("t1");
  });

  it("takes an answer without `self_placed` as not placed", async () => {
    server = fakeServer(redeemed({ self_person_id: "p1" }));
    const joined = await redeemInvite(server as never, "tok");
    expect(joined?.selfPlaced).toBe(false);
  });
});

describe("establishMembership", () => {
  it("opens the canvas on the entry a claim invite claimed", async () => {
    server = fakeServer(redeemed({ self_person_id: "p1", self_placed: true }));
    expect(
      await establishMembership(server as never, { invite: "tok", next: "/tree" }),
    ).toBe("/tree?person=p1");
  });

  it("sends someone with no entry on the tree to onboarding", async () => {
    server = fakeServer(redeemed({ self_person_id: null, self_placed: false }));
    expect(
      await establishMembership(server as never, { invite: "tok", next: "/tree" }),
    ).toBe("/onboarding");
  });

  it("says so when the invite can't be redeemed", async () => {
    server = fakeServer({ data: null, error: { message: "invalid_or_expired_invite" } });
    expect(
      await establishMembership(server as never, { invite: "tok", next: "/tree" }),
    ).toBe("/join?error=invite");
    expect(setCurrentTreeCookie).not.toHaveBeenCalled();
  });
});

describe("signInWithInvite", () => {
  it("lands a claim invite on the entry it claimed", async () => {
    server = fakeServer(redeemed({ self_person_id: "p1", self_placed: true }));
    expect(await signInWithInvite("tok")).toEqual({
      ok: true,
      treeId: "t1",
      next: "/tree?person=p1",
    });
    expect(server.auth.verifyOtp).toHaveBeenCalledWith({
      type: "email",
      token_hash: "hash",
    });
  });

  it("lands on onboarding when nothing was claimed", async () => {
    server = fakeServer(redeemed({ self_person_id: null, self_placed: false }));
    expect(await signInWithInvite("tok")).toEqual({
      ok: true,
      treeId: "t1",
      next: "/onboarding",
    });
  });

  it("still refuses an address that already has an account", async () => {
    admin = fakeAdmin({ hasProfile: true });
    server = fakeServer(redeemed({ self_person_id: "p1", self_placed: true }));
    expect(await signInWithInvite("tok")).toEqual({
      ok: false,
      reason: "already_member",
    });
    expect(server.rpc).not.toHaveBeenCalled();
  });
});
