import { beforeEach, describe, expect, it, vi } from "vitest";

// The tree context (Step 77.1) with the signed-in client stubbed: `my_trees`
// answers with the member's own trees, `trees` with those RLS would show
// (a visitor's), `people` with an entry's home tree. Every table read is
// recorded, so a test can say what was never asked.
vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
let myTrees: Row[];
let visibleTrees: Record<string, Row>;
let homeTreeOf: Record<string, string>;
let chosenTree: string | null;
let profile: Row | null;
let placed: boolean;
let read: string[];

vi.mock("@/lib/auth", () => ({
  getProfile: async () => profile,
  getSessionUser: async () => (profile ? { id: profile.auth_user_id } : null),
  requireProfile: async () => {
    if (!profile) throw new Error("REDIRECT /join");
    return profile;
  },
}));
vi.mock("@/lib/current-tree.server", () => ({
  readCurrentTreeId: async () => chosenTree,
}));
vi.mock("@/lib/placements.server", () => ({
  isPlacedOn: async () => placed,
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      read.push(table);
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        order: () => query,
        maybeSingle: async () => {
          if (table === "trees") {
            return { data: visibleTrees[filters.id as string] ?? null };
          }
          if (table === "people") {
            const home = homeTreeOf[filters.id as string];
            return { data: home ? { tree_id: home } : null };
          }
          return { data: null };
        },
        then: (resolve: (res: { data: Row[] }) => unknown) =>
          resolve({ data: table === "my_trees" ? myTrees : [] }),
      };
      return query;
    },
  }),
}));

import {
  currentAccess,
  getRoleIn,
  membershipOf,
  requireTreeSelfPersonWith,
} from "@/lib/tree-context";

const ME = "u-me";
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const T9 = "99999999-9999-4999-8999-999999999999";

function mine(id: string, role: string, name = id): Row {
  return {
    id,
    name,
    slug: `${name}-slug`,
    role,
    created_by: ME,
    created_at: "2026-09-01T00:00:00Z",
    joined_at: "2026-09-01T00:00:00Z",
    member_count: 3,
    person_count: 9,
  };
}

beforeEach(() => {
  profile = { auth_user_id: ME, self_person_id: "p-me", display_name: "Me" };
  myTrees = [mine(T1, "admin", "Sayanis"), mine(T2, "member", "Jaffers")];
  visibleTrees = {};
  homeTreeOf = {};
  chosenTree = null;
  placed = true;
  read = [];
});

describe("currentAccess (Step 77.1)", () => {
  it("builds a member's tree from their own list, reading no `trees` row", async () => {
    chosenTree = T2;
    const access = await currentAccess();
    expect(access).toMatchObject({
      kind: "member",
      membership: {
        tree: { id: T2, name: "Jaffers", slug: "Jaffers-slug", created_by: ME },
        role: "member",
        isRoot: false,
      },
    });
    expect(read).not.toContain("trees");
  });

  it("reads the tree a visitor may see, and nothing about how", async () => {
    chosenTree = T9;
    visibleTrees[T9] = {
      id: T9,
      name: "Opened",
      slug: "opened",
      created_by: "u-other",
      created_at: "2026-09-02T00:00:00Z",
    };
    const access = await currentAccess();
    expect(access).toMatchObject({
      kind: "visitor",
      visit: { tree: { id: T9, name: "Opened" } },
    });
    expect(read).toContain("trees");
    expect(read).not.toContain("tree_visibility");
  });

  it("falls back on the tree their own entry calls home", async () => {
    chosenTree = T9; // gone, or no longer theirs to see
    homeTreeOf["p-me"] = T2;
    const access = await currentAccess();
    expect(access?.kind === "member" && access.membership.tree.id).toBe(T2);
  });

  it("is nobody's without a profile", async () => {
    profile = null;
    expect(await currentAccess()).toBeNull();
  });
});

describe("membershipOf (Step 77.1)", () => {
  it("answers from their own trees", async () => {
    const { membership, error } = await membershipOf(T1);
    expect(error).toBeUndefined();
    expect(membership).toMatchObject({ tree: { id: T1 }, role: "admin", isRoot: true });
    expect(read).not.toContain("trees");
  });

  it("says whether a tree that isn't theirs is gone or only not theirs", async () => {
    visibleTrees[T9] = { id: T9, name: "Opened", slug: "opened" };
    await expect(membershipOf(T9)).resolves.toEqual({
      error: "You are not a member of that tree.",
    });
    await expect(membershipOf("33333333-3333-4333-8333-333333333333")).resolves.toEqual({
      error: "That tree no longer exists.",
    });
  });

  it("refuses someone signed out", async () => {
    profile = null;
    myTrees = [];
    await expect(membershipOf(T1)).resolves.toEqual({
      error: "You are not signed in.",
    });
  });

  it("gives the account type on each tree from the same list", async () => {
    expect(await getRoleIn(T1)).toBe("admin");
    expect(await getRoleIn(T2)).toBe("member");
    expect(await getRoleIn(T9)).toBeNull();
  });
});

describe("requireTreeSelfPersonWith (Step 77.1)", () => {
  beforeEach(() => {
    chosenTree = T1;
  });

  it("hands back the page's reads when their entry is on the tree", async () => {
    const load = vi.fn(async (m: { selfPersonId: string }) => `read for ${m.selfPersonId}`);
    const { membership, data } = await requireTreeSelfPersonWith(load);
    expect(membership.tree.id).toBe(T1);
    expect(data).toBe("read for p-me");
    expect(load).toHaveBeenCalledOnce();
  });

  it("sends them to onboarding first, whatever the reads found", async () => {
    placed = false;
    await expect(
      requireTreeSelfPersonWith(async () => {
        throw new Error("NEXT_NOT_FOUND");
      }),
    ).rejects.toThrow("REDIRECT /onboarding");
  });

  it("lets a read's own failure through once their entry is there", async () => {
    await expect(
      requireTreeSelfPersonWith(async () => {
        throw new Error("NEXT_NOT_FOUND");
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sends someone with no entry of their own to onboarding before reading", async () => {
    profile = { ...profile, self_person_id: null };
    const load = vi.fn(async () => null);
    await expect(requireTreeSelfPersonWith(load)).rejects.toThrow(
      "REDIRECT /onboarding",
    );
    expect(load).not.toHaveBeenCalled();
  });
});
