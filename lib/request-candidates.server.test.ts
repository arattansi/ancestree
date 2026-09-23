import { beforeEach, describe, expect, it, vi } from "vitest";

// The loaders with the signed-in client stubbed: each request id answers with
// its own rows, or an error.
type Reply = { data: unknown[] | null; error: { message: string } | null };
let replies: Record<string, Reply>;
let sent: { fn: string; args: unknown }[];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: { p_request: string }) => {
      sent.push({ fn, args });
      return replies[args.p_request] ?? { data: [], error: null };
    },
  }),
}));

import {
  getRequestCandidates,
  listRequestCandidates,
} from "@/lib/request-candidates.server";

const ROW = {
  id: "p1",
  first_name: "Amina",
  preferred_name: null,
  last_name: "Rattansi",
  maiden_name: null,
  date_of_birth: "1990-04-02",
  date_of_death: null,
  is_deceased: false,
  city_of_birth: "Nairobi",
  country_of_birth: "Kenya",
  parent_names: "Karim & Zainab",
  score: 1,
};

beforeEach(() => {
  replies = {};
  sent = [];
});

describe("getRequestCandidates (Step 30.3)", () => {
  it("asks invite_request_candidates for the request and shapes its rows", async () => {
    replies.r1 = { data: [ROW], error: null };
    await expect(getRequestCandidates("r1")).resolves.toEqual([
      {
        id: "p1",
        name: "Amina Rattansi",
        lifespan: "b. 1990",
        birthplace: "Nairobi, Kenya",
        parents: "Karim & Zainab",
        score: 1,
      },
    ]);
    expect(sent).toEqual([
      { fn: "invite_request_candidates", args: { p_request: "r1" } },
    ]);
  });

  it("tells a refusal apart from no match", async () => {
    // Not a Root of the request's tree, say: approving as an entry must stop.
    replies.r1 = { data: null, error: { message: "Only a Root of its tree" } };
    replies.r2 = { data: [], error: null };
    await expect(getRequestCandidates("r1")).resolves.toBeNull();
    await expect(getRequestCandidates("r2")).resolves.toEqual([]);
  });
});

describe("listRequestCandidates (Step 30.3)", () => {
  it("keys each request's candidates by its id, showing none where they couldn't be read", async () => {
    replies.r1 = { data: [ROW], error: null };
    replies.r2 = { data: null, error: { message: "boom" } };
    const lists = await listRequestCandidates(["r1", "r2", "r3"]);
    expect([...lists.keys()]).toEqual(["r1", "r2", "r3"]);
    expect(lists.get("r1")?.map((c) => c.id)).toEqual(["p1"]);
    expect(lists.get("r2")).toEqual([]);
    expect(lists.get("r3")).toEqual([]);
  });

  it("asks nothing when there are no requests", async () => {
    await expect(listRequestCandidates([])).resolves.toEqual(new Map());
    expect(sent).toEqual([]);
  });
});
