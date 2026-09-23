import { beforeEach, describe, expect, it, vi } from "vitest";

// Where accepting an invite lands (Step 30.2). The database decides whether a
// claim invite claimed its entry (`redeem_invite_tree`); these check that the
// app reads its answer and sends them to the right place. Stubbed: the tree
// cookie, the service-role client (the invite and the new account) and the
// cookie-bound client (verifying the token, redeeming).
const setCurrentTreeCookie = vi.fn();
// The invite waiting for a first-timer's address (Step 30.8), as
// `lib/first-timer.server.ts` finds it; its own tests cover the finding.
const waitingInviteHref = vi.fn();
let admin: ReturnType<typeof fakeAdmin>;
let server: ReturnType<typeof fakeServer>;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/current-tree.server", () => ({
  setCurrentTreeCookie: (treeId: string) => setCurrentTreeCookie(treeId),
}));
vi.mock("@/lib/first-timer.server", () => ({
  waitingInviteHref: (email: string) => waitingInviteHref(email),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => server }));

import {
  addressHasProfile,
  completeEmailSignIn,
  emailInviteSignInLink,
  establishMembership,
  getInviteRecipient,
  opensOnSignInLink,
  redeemInvite,
  signInWithInvite,
  type InviteRecipient,
} from "@/lib/sign-in.server";

const TREE = { tree_id: "t1", tree_slug: "the-tree", tree_name: "The Tree" };

/** `redeem_invite_tree` as the database answers it. */
function redeemed(extra: Record<string, unknown>) {
  return { data: { ...TREE, ...extra }, error: null };
}

/**
 * The cookie-bound client: `rpc` answers the redeem (or `ensure_profile`),
 * and the token signs in someone at newcomer@example.com, now verified,
 * whose account keeps `metadata` (Step 30.7) — or, with `spent`, was
 * already used by this browser, which is signed in as them. `otpError`
 * makes sending a sign-in email fail.
 */
function fakeServer(
  rpc: { data: unknown; error: unknown },
  {
    metadata = {},
    spent = false,
    otpError = null,
  }: {
    metadata?: Record<string, unknown>;
    spent?: boolean;
    otpError?: { message: string } | null;
  } = {},
) {
  const user = {
    id: "u1",
    email: "newcomer@example.com",
    email_confirmed_at: "2026-09-23T07:00:00Z",
    user_metadata: metadata,
  };
  return {
    rpc: vi.fn(async () => rpc),
    auth: {
      verifyOtp: vi.fn(async () =>
        spent
          ? { data: { user: null, session: null }, error: { message: "Token has expired or is invalid" } }
          : { data: { user, session: {} }, error: null },
      ),
      getUser: vi.fn(async () => ({ data: { user } })),
      signInWithOtp: vi.fn(async () => ({ data: {}, error: otpError })),
    },
  };
}

/** `ensure_profile` refusing someone who isn't on the admin allowlist. */
const NEEDS_INVITE = { data: null, error: { message: "needs_invite" } };

/** A request row as the invite embeds it. */
type RequestRow = { first_name: string; last_name: string; email: string; source: string };

/**
 * A live invite emailed to newcomer@example.com — from `request`, when it
 * came from one — and no account for them yet. `member` is what
 * `address_has_profile` answers for the address (Step 30.8; `null` for a
 * failed lookup), and `hasProfile` what the account the minted token
 * belongs to has. `live: false` is an invite that's been used up.
 */
function fakeAdmin({
  member = false,
  hasProfile = false,
  request = null,
  live = true,
}: {
  member?: boolean | null;
  hasProfile?: boolean;
  request?: RequestRow | null;
  live?: boolean;
} = {}) {
  const invite = {
    status: live ? "active" : "accepted",
    expires_at: null,
    invited_email: "newcomer@example.com",
    invite_requests: request,
  };
  return {
    rpc: vi.fn(async () =>
      member === null
        ? { data: null, error: { message: "boom" } }
        : { data: member, error: null },
    ),
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
  waitingInviteHref.mockReset();
  waitingInviteHref.mockResolvedValue(null);
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

describe("a plain sign-in by someone who isn't a member (Step 30.8)", () => {
  it("opens the invite emailed to the address they've just verified", async () => {
    server = fakeServer(NEEDS_INVITE);
    waitingInviteHref.mockResolvedValue("/join/waiting");
    expect(
      await establishMembership(server as never, {
        next: "/tree",
        email: "newcomer@example.com",
      }),
    ).toBe("/join/waiting");
    expect(waitingInviteHref).toHaveBeenCalledWith("newcomer@example.com");
    // Opened, not redeemed: its page asks for the privacy agreement (Step 30.4).
    expect(server.rpc).toHaveBeenCalledTimes(1);
    expect(server.rpc).toHaveBeenCalledWith("ensure_profile", {});
  });

  it("leaves someone with no invite waiting on /join", async () => {
    server = fakeServer(NEEDS_INVITE);
    expect(
      await establishMembership(server as never, {
        next: "/tree",
        email: "newcomer@example.com",
      }),
    ).toBe("/join?status=pending");
  });

  it("looks nothing up without a verified address", async () => {
    server = fakeServer(NEEDS_INVITE);
    expect(
      await establishMembership(server as never, { next: "/tree", email: null }),
    ).toBe("/join?status=pending");
    expect(waitingInviteHref).not.toHaveBeenCalled();
  });

  it("lands a member where they were going, never on an invite of theirs", async () => {
    server = fakeServer({ data: { auth_user_id: "u1" }, error: null });
    waitingInviteHref.mockResolvedValue("/join/waiting");
    expect(
      await establishMembership(server as never, {
        next: "/join/theirs",
        email: "newcomer@example.com",
      }),
    ).toBe("/join/theirs");
    expect(waitingInviteHref).not.toHaveBeenCalled();
  });

  it("looks up the address the emailed token verified", async () => {
    server = fakeServer(NEEDS_INVITE);
    waitingInviteHref.mockResolvedValue("/join/waiting");
    expect(
      await completeEmailSignIn({ tokenHash: "hash", type: "email", invite: null, next: "/tree" }),
    ).toBe("/join/waiting");
    expect(waitingInviteHref).toHaveBeenCalledWith("newcomer@example.com");
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
    admin = fakeAdmin({ member: true });
    server = fakeServer(redeemed({ self_person_id: "p1", self_placed: true }));
    expect(await signInWithInvite("tok")).toEqual({
      ok: false,
      reason: "already_member",
    });
    expect(admin.rpc).toHaveBeenCalledWith("address_has_profile", {
      p_email: "newcomer@example.com",
    });
    expect(server.rpc).not.toHaveBeenCalled();
  });

  it("mints nothing for a member's address, so their sign-in email can go at once (Step 30.8)", async () => {
    admin = fakeAdmin({ member: true });
    server = fakeServer(redeemed({ self_person_id: "p1", self_placed: true }));
    await signInWithInvite("tok");
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(admin.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(server.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("still refuses an account that became a member since the lookup", async () => {
    admin = fakeAdmin({ member: false, hasProfile: true });
    server = fakeServer(redeemed({ self_person_id: "p1", self_placed: true }));
    expect(await signInWithInvite("tok")).toEqual({
      ok: false,
      reason: "already_member",
    });
    expect(server.auth.verifyOtp).not.toHaveBeenCalled();
    expect(server.rpc).not.toHaveBeenCalled();
  });

  it("signs nobody in when it can't tell whether the address is a member's", async () => {
    admin = fakeAdmin({ member: null });
    server = fakeServer(redeemed({ self_person_id: "p1", self_placed: true }));
    expect(await signInWithInvite("tok")).toEqual({ ok: false, reason: "failed" });
    expect(admin.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(server.auth.verifyOtp).not.toHaveBeenCalled();
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

describe("emailInviteSignInLink (Step 30.8)", () => {
  it("emails the invite's own address a sign-in link back to the invite", async () => {
    admin = fakeAdmin({ member: true });
    server = fakeServer({ data: null, error: null });
    expect(await emailInviteSignInLink("tok")).toEqual({
      ok: true,
      email: "newcomer@example.com",
    });
    expect(server.auth.signInWithOtp).toHaveBeenCalledTimes(1);
    const [{ email, options }] = server.auth.signInWithOtp.mock.calls[0] as unknown as [
      { email: string; options: { emailRedirectTo: string; shouldCreateUser: boolean } },
    ];
    expect(email).toBe("newcomer@example.com");
    // An account that exists already: never a new one on an invite's say-so.
    expect(options.shouldCreateUser).toBe(false);
    const callback = new URL(options.emailRedirectTo);
    expect(callback.pathname).toBe("/auth/callback");
    // Lands on the invite, signed in: joining there is theirs to press.
    expect(callback.searchParams.get("next")).toBe("/join/tok");
    expect(callback.searchParams.has("invite")).toBe(false);
  });

  it("sends nothing for an invite that's no longer valid", async () => {
    admin = fakeAdmin({ live: false });
    server = fakeServer({ data: null, error: null });
    expect(await emailInviteSignInLink("tok")).toEqual({ ok: false, reason: "invalid" });
    expect(server.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("says so when the email can't be sent", async () => {
    server = fakeServer({ data: null, error: null }, { otpError: { message: "rate limited" } });
    expect(await emailInviteSignInLink("tok")).toEqual({ ok: false, reason: "failed" });
  });
});

describe("an emailed invite opened signed out (Step 41.2)", () => {
  /** The invite's recipient, as `getInviteRecipient` hands it to the page. */
  const RECIPIENT: InviteRecipient = {
    email: "member@example.com",
    name: null,
    joiningName: null,
    requested: false,
  };

  beforeEach(() => {
    server = fakeServer({ data: null, error: null });
  });

  it("opens on the sign-in link when the address has an account", async () => {
    admin = fakeAdmin({ member: true });
    expect(await opensOnSignInLink(RECIPIENT, { signedIn: false })).toBe(true);
    expect(admin.rpc).toHaveBeenCalledWith("address_has_profile", {
      p_email: "member@example.com",
    });
  });

  it("keeps the accept form for a newcomer", async () => {
    admin = fakeAdmin({ member: false });
    expect(await opensOnSignInLink(RECIPIENT, { signedIn: false })).toBe(false);
  });

  it("only looks up: the page's GET mints and sends nothing, as mail scanners open it", async () => {
    admin = fakeAdmin({ member: true });
    await opensOnSignInLink(RECIPIENT, { signedIn: false });
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(admin.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(server.auth.signInWithOtp).not.toHaveBeenCalled();
    expect(server.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("leaves the page as it was for someone signed in", async () => {
    admin = fakeAdmin({ member: true });
    expect(await opensOnSignInLink(RECIPIENT, { signedIn: true })).toBe(false);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("leaves a bare link alone", async () => {
    admin = fakeAdmin({ member: true });
    expect(await opensOnSignInLink(null, { signedIn: false })).toBe(false);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("keeps the accept form, which asks again, when the lookup fails", async () => {
    admin = fakeAdmin({ member: null });
    expect(await opensOnSignInLink(RECIPIENT, { signedIn: false })).toBe(false);
  });

  it("tells an address with an account from one without, or a failed lookup", async () => {
    admin = fakeAdmin({ member: true });
    expect(await addressHasProfile("member@example.com")).toBe(true);
    admin = fakeAdmin({ member: false });
    expect(await addressHasProfile("member@example.com")).toBe(false);
    admin = fakeAdmin({ member: null });
    expect(await addressHasProfile("member@example.com")).toBeNull();
  });
});
