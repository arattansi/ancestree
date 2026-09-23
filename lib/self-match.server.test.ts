import { beforeEach, describe, expect, it, vi } from "vitest";

// Where onboarding opens (Step 30.7): the name it works out, and whether it
// searched for it before the page rendered. Stubbed: the signed-in account
// and the cookie-bound client's `search_self_candidates`.
let user: { email: string; user_metadata: Record<string, unknown> } | null;
let search: { data: unknown; error: unknown };
const rpc = vi.fn(async () => search);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getUser: async () => user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

import { onboardingStart } from "@/lib/self-match.server";

const ROW = {
  id: "p1",
  first_name: "Mary Ann",
  preferred_name: null,
  last_name: "Smith",
  date_of_birth: null,
  date_of_death: null,
  is_deceased: false,
  city_of_birth: null,
  country_of_birth: null,
  parent_names: null,
  score: 1,
};

beforeEach(() => {
  rpc.mockClear();
  user = {
    email: "mas@example.com",
    user_metadata: { first_name: "Mary Ann", last_name: "Smith" },
  };
  search = { data: [ROW], error: null };
});

describe("onboardingStart", () => {
  it("searches for the name they joined by and opens on what it found", async () => {
    const start = await onboardingStart({
      treeId: "t1",
      displayName: "Mary Ann Smith",
      treeHasEntries: true,
    });
    expect(rpc).toHaveBeenCalledWith("search_self_candidates", {
      p_first: "Mary Ann",
      p_last: "Smith",
      p_tree: "t1",
    });
    expect(start.step).toBe("results");
    expect(start.name).toEqual({ first_name: "Mary Ann", last_name: "Smith" });
    expect(start.candidates.map((c) => c.id)).toEqual(["p1"]);
  });

  it("opens on their name, to try again, when the search fails", async () => {
    search = { data: null, error: { message: "boom" } };
    const start = await onboardingStart({
      treeId: "t1",
      displayName: "Mary Ann Smith",
      treeHasEntries: true,
    });
    expect(start).toEqual({
      name: { first_name: "Mary Ann", last_name: "Smith" },
      step: "name",
      candidates: [],
    });
  });

  it("asks their name without searching when the address is all we have", async () => {
    user = { email: "jdoe@example.com", user_metadata: {} };
    const start = await onboardingStart({
      treeId: "t1",
      displayName: "jdoe",
      treeHasEntries: true,
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(start.step).toBe("name");
    expect(start.name).toEqual({ first_name: "", last_name: "" });
  });

  it("doesn't search a tree nobody is on yet", async () => {
    const start = await onboardingStart({
      treeId: "t1",
      displayName: "Mary Ann Smith",
      treeHasEntries: false,
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(start.step).toBe("add");
    expect(start.name).toEqual({ first_name: "Mary Ann", last_name: "Smith" });
  });
});
