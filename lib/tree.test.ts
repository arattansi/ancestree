import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => {
    throw new Error("tests pass their own client");
  },
}));

import { getTreeGraph } from "@/lib/tree";

const ROWS: Record<string, unknown[]> = {
  people: [
    { id: "p1", photo_path: null, place_id_birth: null, place_id_death: null },
    { id: "p2", photo_path: null, place_id_birth: null, place_id_death: null },
  ],
  relationships: [],
  claims: [{ id: "c1", person_id: "p2", status: "approved", claimant_user_id: "u2" }],
  entry_comments: [],
  historical_names: [],
  places: [],
  profiles: [
    { auth_user_id: "u1", role: "admin", self_person_id: "p1" },
    { auth_user_id: "u2", role: "leaf", self_person_id: "p2" },
  ],
};

/**
 * A stand-in for the Supabase client: every filter is ignored and each table
 * answers with its fixture rows. It records which tables were read, which is
 * the point — a share link must never touch `profiles`.
 */
function fakeClient() {
  const read: string[] = [];
  const query = (table: string) => {
    const result = { data: ROWS[table] ?? [], error: null };
    const builder: Record<string, unknown> = {
      then: (resolve: (v: typeof result) => unknown) => resolve(result),
    };
    for (const m of ["select", "eq", "in", "not", "order", "limit"]) {
      builder[m] = () => builder;
    }
    return builder;
  };
  const client = {
    from: (table: string) => {
      read.push(table);
      return query(table);
    },
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }) }) },
  };
  return { client: client as never, read };
}

describe("getTreeGraph account types (Step 19.1)", () => {
  it("leaves them out by default, as a share link calls it", async () => {
    const { client, read } = fakeClient();
    const { people } = await getTreeGraph("t1", client);
    expect(people.map((p) => p.account_type)).toEqual([null, null]);
    expect(read).not.toContain("profiles");
  });

  it("loads them when the member canvas opts in", async () => {
    const { client, read } = fakeClient();
    const { people } = await getTreeGraph("t1", client, {
      withAccountTypes: true,
    });
    expect(people.map((p) => p.account_type)).toEqual(["admin", "leaf"]);
    expect(read).toContain("profiles");
  });
});
