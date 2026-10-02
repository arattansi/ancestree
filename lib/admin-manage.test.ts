import { describe, expect, it } from "vitest";

import {
  accountTreesLine,
  readAdminSearch,
  readFoundAccount,
  soleRootTreesOf,
  treeCountsLine,
} from "@/lib/admin-manage";

const row = {
  user_id: "u1",
  email: "a@example.com",
  display_name: "Ada Lovelace",
  created_at: "2026-10-02T10:00:00Z",
  last_sign_in_at: null,
  suspended: true,
  reviewer: null,
  trees: [
    {
      id: "t1",
      name: "Oak",
      role: "admin",
      successors: [
        { user_id: "u2", name: "Byron", role: "branch_admin" },
        { user_id: "u3", name: null, role: "member" },
        { name: "no id" },
      ],
    },
    { id: "t2", name: "Ash", role: "member", successors: null },
    "junk",
    { name: "no id" },
  ],
};

describe("readAdminSearch", () => {
  it("trims, caps and drops an empty search", () => {
    expect(readAdminSearch("  ada ")).toBe("ada");
    expect(readAdminSearch("   ")).toBeNull();
    expect(readAdminSearch(["ada"])).toBeNull();
    expect(readAdminSearch(undefined)).toBeNull();
    expect(readAdminSearch("x".repeat(500))).toHaveLength(100);
  });
});

describe("readFoundAccount", () => {
  const account = readFoundAccount(row);

  it("reads the row and skips trees it can't read", () => {
    expect(account).toMatchObject({
      userId: "u1",
      name: "Ada Lovelace",
      suspended: true,
      reviewer: false,
    });
    expect(account.trees.map((t) => [t.name, t.type])).toEqual([
      ["Oak", "Root"],
      ["Ash", "Leaf"],
    ]);
  });

  it("names who could take over where they're the only Root", () => {
    expect(soleRootTreesOf(account)).toEqual([
      {
        treeId: "t1",
        treeName: "Oak",
        successors: [
          { userId: "u2", name: "Byron (Branch)" },
          { userId: "u3", name: "Unnamed member (Leaf)" },
        ],
      },
    ]);
  });

  it("lists their trees on one line", () => {
    expect(accountTreesLine(account)).toBe("Oak (Root) · Ash (Leaf)");
    expect(accountTreesLine({ ...account, trees: [] })).toBeNull();
  });

  it("reads a row with no trees", () => {
    expect(readFoundAccount({ ...row, trees: null }).trees).toEqual([]);
  });
});

describe("treeCountsLine", () => {
  it("counts members and entries", () => {
    const tree = { id: "t", name: "Oak", createdAt: "", roots: [] };
    expect(treeCountsLine({ ...tree, members: 1, entries: 1 })).toBe("1 member · 1 entry");
    expect(treeCountsLine({ ...tree, members: 3, entries: 41 })).toBe("3 members · 41 entries");
  });
});
