import { beforeEach, describe, expect, it, vi } from "vitest";

// The loader with the signed-in client stubbed: one ask's row, or nothing
// (RLS hides someone else's ask; a deleted one is gone).
let row: unknown;
let asked: { table: string; columns: string; id: string } | null;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: async () => {
            asked = { table, columns, id };
            return { data: row, error: null };
          },
        }),
      }),
    }),
  }),
}));

import { loadOpenedRelay } from "@/lib/opened-relay.server";

beforeEach(() => {
  row = null;
  asked = null;
});

describe("loadOpenedRelay (Step 41.1)", () => {
  it("reads the ask back with the name of its tree", async () => {
    row = {
      status: "invited",
      first_name: "Zed",
      last_name: "Qadri",
      trees: { name: "Qadri Family" },
    };
    await expect(loadOpenedRelay("r1")).resolves.toEqual({
      status: "invited",
      firstName: "Zed",
      lastName: "Qadri",
      treeName: "Qadri Family",
    });
    expect(asked).toEqual({
      table: "invite_relays",
      columns: "status, first_name, last_name, trees(name)",
      id: "r1",
    });
  });

  it("takes the tree from an embed handed back as an array, or none", async () => {
    row = { status: "invited", first_name: "Zed", last_name: "Qadri", trees: [{ name: "Qadri Family" }] };
    await expect(loadOpenedRelay("r1")).resolves.toMatchObject({ treeName: "Qadri Family" });
    row = { status: "dismissed", first_name: "Zed", last_name: "Qadri", trees: null };
    await expect(loadOpenedRelay("r1")).resolves.toMatchObject({
      status: "dismissed",
      treeName: null,
    });
  });

  it("is null when the member can't read it", async () => {
    await expect(loadOpenedRelay("r1")).resolves.toBeNull();
  });
});
