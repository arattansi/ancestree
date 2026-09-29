import { beforeEach, describe, expect, it, vi } from "vitest";

// Who invited a member onto a tree (Step 50), with the signed-in client
// stubbed: `member_directory` rows by member and `tree_people` rows by entry,
// on tree t1. Anything RLS would hide is simply absent. The directory is read
// whole for the tree (Step 77.1); an entry, one at a time.
let directory: Record<string, Record<string, unknown>>;
let people: Record<string, Record<string, unknown>>;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => ({
      select: () => {
        const filters: Record<string, string> = {};
        const query = {
          eq: (column: string, value: string) => {
            filters[column] = value;
            return query;
          },
          then: (resolve: (res: { data: unknown[]; error: null }) => unknown) =>
            resolve({
              data:
                table === "member_directory" && filters.tree_id === "t1"
                  ? Object.entries(directory).map(([id, row]) => ({
                      auth_user_id: id,
                      ...row,
                    }))
                  : [],
              error: null,
            }),
          maybeSingle: async () => {
            if (filters.tree_id !== "t1") return { data: null, error: null };
            return { data: people[filters.id] ?? null, error: null };
          },
        };
        return query;
      },
    }),
  }),
}));

import { inviterName } from "@/lib/welcome.server";

beforeEach(() => {
  directory = {};
  people = {};
});

describe("inviterName", () => {
  it("names the inviter by their own entry, as the invite page did", async () => {
    directory = {
      me: { invited_by_user_id: "aalim", invited_by_name: "aalim" },
      aalim: { self_person_id: "pa", display_name: "aalim" },
    };
    people = {
      pa: { first_name: "Aalim", preferred_name: null, last_name: "Rattansi" },
    };
    await expect(inviterName("t1", "me")).resolves.toBe("Aalim Rattansi");
  });

  it("falls back on the name they go by when their entry isn't on the tree", async () => {
    directory = {
      me: { invited_by_user_id: "aalim", invited_by_name: "Aalim" },
      aalim: { self_person_id: "elsewhere", display_name: " Aalim R " },
    };
    await expect(inviterName("t1", "me")).resolves.toBe("Aalim R");
  });

  it("falls back on the name they went by once they've left the tree", async () => {
    directory = { me: { invited_by_user_id: "gone", invited_by_name: "Raiya" } };
    await expect(inviterName("t1", "me")).resolves.toBe("Raiya");
  });

  it("is nobody for a member nobody invited", async () => {
    directory = { me: { invited_by_user_id: null, invited_by_name: null } };
    await expect(inviterName("t1", "me")).resolves.toBeNull();
    directory = {};
    await expect(inviterName("t1", "me")).resolves.toBeNull();
  });

  it("never names the member themselves", async () => {
    directory = { me: { invited_by_user_id: "me", invited_by_name: "Me" } };
    await expect(inviterName("t1", "me")).resolves.toBeNull();
  });

  it("only reads the tree it's asked about", async () => {
    directory = { me: { invited_by_user_id: "aalim", invited_by_name: "Aalim" } };
    await expect(inviterName("t2", "me")).resolves.toBeNull();
  });
});
