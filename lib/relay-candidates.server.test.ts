import { beforeEach, describe, expect, it, vi } from "vitest";

// The loaders with the signed-in client stubbed: each ask-and-tree pair
// answers with its own rows, or an error.
type Reply = { data: unknown[] | null; error: { message: string } | null };
let replies: Record<string, Reply>;
let sent: { fn: string; args: unknown }[];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: { p_relay: string; p_tree: string }) => {
      sent.push({ fn, args });
      return replies[`${args.p_relay}/${args.p_tree}`] ?? { data: [], error: null };
    },
  }),
}));

import {
  getRelayCandidates,
  listRelayCandidates,
} from "@/lib/relay-candidates.server";

const ROW = {
  id: "p1",
  first_name: "Zahid",
  preferred_name: null,
  last_name: "Qadri",
  maiden_name: null,
  date_of_birth: "1994-05-02",
  date_of_death: null,
  is_deceased: false,
  city_of_birth: "Nairobi",
  country_of_birth: "Kenya",
  parent_names: "Karim & Zainab",
  score: 0.7,
};

beforeEach(() => {
  replies = {};
  sent = [];
});

describe("getRelayCandidates (Step 41.1)", () => {
  it("asks invite_relay_candidates for the ask on that tree and shapes its rows", async () => {
    replies["r1/t1"] = { data: [ROW], error: null };
    await expect(getRelayCandidates("r1", "t1")).resolves.toEqual([
      {
        id: "p1",
        name: "Zahid Qadri",
        lifespan: "b. 1994",
        birthplace: "Nairobi, Kenya",
        parents: "Karim & Zainab",
        score: 0.7,
      },
    ]);
    expect(sent).toEqual([
      { fn: "invite_relay_candidates", args: { p_relay: "r1", p_tree: "t1" } },
    ]);
  });

  it("tells a refusal apart from no match", async () => {
    // Someone else's ask, or a tree they're not on: sending as an entry must stop.
    replies["r1/t1"] = { data: null, error: { message: "Only the member an ask went to" } };
    replies["r2/t1"] = { data: [], error: null };
    await expect(getRelayCandidates("r1", "t1")).resolves.toBeNull();
    await expect(getRelayCandidates("r2", "t1")).resolves.toEqual([]);
  });
});

describe("listRelayCandidates (Step 41.1)", () => {
  it("keys each ask's candidates by tree, leaving out trees with none or unread", async () => {
    replies["r1/t1"] = { data: [ROW], error: null };
    replies["r1/t2"] = { data: null, error: { message: "boom" } };
    replies["r2/t2"] = { data: [{ ...ROW, id: "p2" }], error: null };
    const lists = await listRelayCandidates(["r1", "r2", "r3"], ["t1", "t2"]);

    expect([...lists.keys()]).toEqual(["r1", "r2", "r3"]);
    expect(Object.keys(lists.get("r1") ?? {})).toEqual(["t1"]);
    expect(lists.get("r1")?.t1.map((c) => c.id)).toEqual(["p1"]);
    expect(Object.keys(lists.get("r2") ?? {})).toEqual(["t2"]);
    expect(lists.get("r2")?.t2.map((c) => c.id)).toEqual(["p2"]);
    expect(lists.get("r3")).toEqual({});
    // Every ask on every tree, once each.
    expect(sent).toHaveLength(6);
  });

  it("asks nothing when there are no asks, or no trees", async () => {
    await expect(listRelayCandidates([], ["t1"])).resolves.toEqual(new Map());
    await expect(listRelayCandidates(["r1"], [])).resolves.toEqual(
      new Map([["r1", {}]]),
    );
    expect(sent).toEqual([]);
  });
});
