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
  completeEmailSignIn,
  establishMembership,
  getInviteRecipient,
  redeemInvite,
  signInWithInvite,
} from "@/lib/sign-in.server";

const TREE = { tree_id: "t1", tree_slug: "the-tree", tree_name: "The Tree" };

/** `redeem_invite_tree` as the database answers it. */
function redeemed(extra: Record<string, unknown>) {
  return { data: { ...TREE, ...extra }, error: null };
}

/**
 * The cookie-bound client: `rpc` answers the redeem, and the token signs in
 * someone whose account keeps `metadata` (Step 30.7) — or, with
 * `spent`, was already used by this browser, which is signed in as them.
 */
function fakeServer(
  rpc: { data: unknown; error: unknown },
  { metadata = {}, spent = false }: { metadata?: Record<string, unknown>; spent?: boolean } = {},
) {
  const user = { id: "u1", user_metadata: metadata };
  return {
    rpc: vi.fn(async () => rpc),
    auth: {
      verifyOtp: vi.fn(async () =>
        spent
          ? { data: { user: null, session: null }, error: { message: "Token has expired or is invalid" } }
          : { data: { user, session: {} }, error: null },
      ),
      getUser: vi.fn(async () => ({ data: { user } })),
    },
  };
}

/** A request row as the invite embeds it. */
type RequestRow = { first_name: string; last_name: string; email: string; source: string };

/**
 * A live invite emailed to newcomer@example.com — from `request`, when it
 * came from one — and no account for them yet.
 */
function fakeAdmin({
  hasProfile = false,
  request = null,
}: { hasProfile?: boolean; request?: RequestRow | null } = {}) {
  const invite = {
    status: "active",
    expires_at: null,
    invited_email: "newcomer@example.com",
    invite_requests: request,
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

describe("the name someone joins by (Step 30.7)", () => {
  const approved: RequestRow = {
    first_name: "Mary Ann",
    last_name: "Smith",
    email: "newcomer@example.com",
    source: "request",
  };

  it("hands back the invite's name in halves too", async () => {
    admin = fakeAdmin({ request: approved });
    expect(await getInviteRecipient("tok")).toEqual({
      email: "newcomer@example.com",
      name: "Mary Ann Smith",
      joiningName: { first_name: "Mary Ann", last_name: "Smith" },
      requested: true,
    });
  });

  it("keeps an emailed invite's name on the account it opens", async () => {
    admin = fakeAdmin({ request: approved });
    server = fakeServer(redeemed({ self_person_id: null, self_placed: false }));
    await signInWithInvite("tok");
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith({
      email: "newcomer@example.com",
      email_confirm: true,
      user_metadata: { first_name: "Mary Ann", last_name: "Smith" },
    });
    expect(server.rpc).toHaveBeenCalledWith("redeem_invite_tree", {
      p_token: "tok",
      p_display_name: "Mary Ann Smith",
    });
  });

  it("opens an account with no name for an invite that had none", async () => {
    server = fakeServer(redeemed({ self_person_id: null, self_placed: false }));
    await signInWithInvite("tok");
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith({
      email: "newcomer@example.com",
      email_confirm: true,
      user_metadata: undefined,
    });
  });

  it("names the profile a bare link makes after the name its form kept", async () => {
    server = fakeServer(redeemed({ self_person_id: null, self_placed: false }), {
      metadata: { first_name: "Zahra", last_name: "Suleman" },
    });
    expect(
      await completeEmailSignIn({ tokenHash: "hash", type: "email", invite: "tok", next: "/tree" }),
    ).toBe("/onboarding");
    expect(server.rpc).toHaveBeenCalledWith("redeem_invite_tree", {
      p_token: "tok",
      p_display_name: "Zahra Suleman",
    });
  });

  it("reads the name off the signed-in account on a second tap", async () => {
    server = fakeServer(redeemed({ self_person_id: null, self_placed: false }), {
      metadata: { first_name: "Zahra", last_name: "Suleman" },
      spent: true,
    });
    await completeEmailSignIn({ tokenHash: "hash", type: "email", invite: "tok", next: "/tree" });
    expect(server.auth.getUser).toHaveBeenCalled();
    expect(server.rpc).toHaveBeenCalledWith("redeem_invite_tree", {
      p_token: "tok",
      p_display_name: "Zahra Suleman",
    });
  });

  it("leaves the naming to the address when the account kept no name", async () => {
    server = fakeServer(redeemed({ self_person_id: null, self_placed: false }));
    await completeEmailSignIn({ tokenHash: "hash", type: "email", invite: "tok", next: "/tree" });
    expect(server.rpc).toHaveBeenCalledWith("redeem_invite_tree", {
      p_token: "tok",
      p_display_name: undefined,
    });
  });
});
