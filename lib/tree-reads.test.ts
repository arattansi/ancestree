import { beforeEach, describe, expect, it, vi } from "vitest";

// The shared reads of Step 77.1: an `in` filter split so a big tree's
// request stays short, and who is behind one entry, asked of that entry
// alone. The signed-in client answers `claims` and `profiles` from the rows
// below, filtered as the query asks.
vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
let claims: Row[];
let profiles: Row[];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const eq: Record<string, unknown> = {};
      const neq: Record<string, unknown> = {};
      const rows = () =>
        (table === "claims" ? claims : table === "profiles" ? profiles : []).filter(
          (r) =>
            Object.entries(eq).every(([k, v]) => r[k] === v) &&
            Object.entries(neq).every(([k, v]) => r[k] !== v),
        );
      const query = {
        select: () => query,
        eq: (k: string, v: unknown) => {
          eq[k] = v;
          return query;
        },
        neq: (k: string, v: unknown) => {
          neq[k] = v;
          return query;
        },
        limit: () => query,
        maybeSingle: async () => ({ data: rows()[0] ?? null }),
        then: (resolve: (res: { data: Row[] }) => unknown) => resolve({ data: rows() }),
      };
      return query;
    },
  }),
}));

import { entryFacts } from "@/lib/entry-access.server";
import { readIn } from "@/lib/tree";

beforeEach(() => {
  claims = [];
  profiles = [];
});

describe("readIn (Step 77.1)", () => {
  it("asks nothing for no ids", async () => {
    const read = vi.fn();
    await expect(readIn([], read)).resolves.toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it("splits a long list into short requests and keeps their order", async () => {
    const ids = Array.from({ length: 320 }, (_, i) => `id-${i}`);
    const read = vi.fn(async (chunk: string[]) => ({
      data: chunk.map((id) => ({ id })),
    }));
    const rows = await readIn(ids, read);
    expect(read.mock.calls.map(([chunk]) => chunk.length)).toEqual([150, 150, 20]);
    expect(rows.map((r) => r.id)).toEqual(ids);
  });

  it("counts a failed chunk as no rows", async () => {
    const rows = await readIn(["a", "b"], async () => ({ data: null }));
    expect(rows).toEqual([]);
  });
});

describe("entryFacts (Step 77.1)", () => {
  it("finds an approved claim, which also makes the entry someone's", async () => {
    claims = [{ id: "c1", person_id: "p1", status: "approved" }];
    await expect(entryFacts("p1", "me")).resolves.toEqual({
      isClaimed: true,
      isSomeoneElsesOwn: true,
    });
  });

  it("finds another member's own entry, never the viewer's", async () => {
    profiles = [{ auth_user_id: "them", self_person_id: "p1" }];
    await expect(entryFacts("p1", "me")).resolves.toEqual({
      isClaimed: false,
      isSomeoneElsesOwn: true,
    });
    await expect(entryFacts("p1", "them")).resolves.toEqual({
      isClaimed: false,
      isSomeoneElsesOwn: false,
    });
  });

  it("ignores a claim still in dispute and other entries' claims", async () => {
    claims = [
      { id: "c1", person_id: "p1", status: "disputed" },
      { id: "c2", person_id: "p2", status: "approved" },
    ];
    await expect(entryFacts("p1", "me")).resolves.toEqual({
      isClaimed: false,
      isSomeoneElsesOwn: false,
    });
  });
});
