import { beforeEach, describe, expect, it, vi } from "vitest";

// The service-role client stubbed: tree_members answers with the rows set
// for it, and the query is kept, to check that it asks only who, about the
// members given, on trees other than this one.
type Filter = [op: "in" | "neq", column: string, value: unknown];
type Query = { table: string; columns: string; filters: Filter[] };
let queries: Query[];
let reply: { data: unknown; error: unknown };
let clientThrows: boolean;

function query(table: string) {
  const q: Query = { table, columns: "", filters: [] };
  queries.push(q);
  const builder = {
    select(columns: string) {
      q.columns = columns;
      return builder;
    },
    in(column: string, value: unknown) {
      q.filters.push(["in", column, value]);
      return builder;
    },
    neq(column: string, value: unknown) {
      q.filters.push(["neq", column, value]);
      return builder;
    },
    then<T>(resolve: (value: { data: unknown; error: unknown }) => T) {
      return Promise.resolve(reply).then(resolve);
    },
  };
  return builder;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (clientThrows) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    return { from: (table: string) => query(table) };
  },
}));

import { membersOnOtherTrees } from "@/lib/remove-member.server";

const TREE = "6f1c2b3a-0000-4000-8000-000000000001";
const LEAF = "6f1c2b3a-0000-4000-8000-00000000000a";
const BRANCH = "6f1c2b3a-0000-4000-8000-00000000000b";

beforeEach(() => {
  queries = [];
  reply = { data: [], error: null };
  clientThrows = false;
});

describe("membersOnOtherTrees", () => {
  it("asks only who of these members is on a tree other than this one", async () => {
    reply = { data: [{ user_id: BRANCH }, { user_id: BRANCH }], error: null };
    const onOther = await membersOnOtherTrees(TREE, [LEAF, BRANCH]);
    expect(onOther).toEqual(new Set([BRANCH]));
    expect(queries).toEqual([
      {
        table: "tree_members",
        columns: "user_id",
        filters: [
          ["in", "user_id", [LEAF, BRANCH]],
          ["neq", "tree_id", TREE],
        ],
      },
    ]);
  });

  it("finds nobody when this is everyone's only tree", async () => {
    await expect(membersOnOtherTrees(TREE, [LEAF])).resolves.toEqual(new Set());
  });

  it("asks nothing when there's nobody to remove", async () => {
    await expect(membersOnOtherTrees(TREE, [])).resolves.toEqual(new Set());
    expect(queries).toEqual([]);
  });

  it("can't tell when the lookup fails", async () => {
    reply = { data: null, error: { message: "timeout" } };
    await expect(membersOnOtherTrees(TREE, [LEAF])).resolves.toBeNull();
  });

  it("can't tell without the service role, and doesn't throw", async () => {
    clientThrows = true;
    await expect(membersOnOtherTrees(TREE, [LEAF])).resolves.toBeNull();
  });
});
