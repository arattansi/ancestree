import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => {
    throw new Error("tests pass their own client");
  },
}));

import { getTreeGraph } from "@/lib/tree";

const ROWS: Record<string, unknown[]> = {
  tree_people: [
    { id: "p1", last_name: "One", home_tree_id: "t1", owner_user_id: "u1", created_by: "u1", photo_path: null, place_id_birth: null, place_id_death: null },
    { id: "p2", last_name: "Two", home_tree_id: "t1", owner_user_id: "u2", created_by: "u1", photo_path: null, place_id_birth: null, place_id_death: null },
  ],
  tree_edges: [],
  claims: [{ id: "c1", person_id: "p2", status: "approved", claimant_user_id: "u2" }],
  entry_reports: [],
  historical_names: [],
  places: [],
  member_directory: [
    { auth_user_id: "u1", role: "admin", self_person_id: "p1" },
    { auth_user_id: "u2", role: "member", self_person_id: "p2" },
  ],
};

/**
 * A stand-in for the Supabase client: every filter is ignored and each table
 * answers with its fixture rows. It records which tables were read, which is
 * the point — a share link must never touch the member directory.
 */
function fakeClient(rows: Record<string, unknown[]> = ROWS) {
  const read: string[] = [];
  const query = (table: string) => {
    const result = { data: rows[table] ?? [], error: null };
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
    expect(read).not.toContain("member_directory");
  });

  it("loads them when the member canvas opts in", async () => {
    const { client, read } = fakeClient();
    const { people } = await getTreeGraph("t1", client, {
      withAccountTypes: true,
    });
    expect(people.map((p) => p.account_type)).toEqual(["admin", "member"]);
    expect(read).toContain("member_directory");
  });
});

describe("getTreeGraph report counts (Step 88.2)", () => {
  const rows = {
    ...ROWS,
    // What RLS lets the viewer read: the open reports they may see.
    entry_reports: [{ person_id: "p2" }, { person_id: "p2" }],
  };

  it("counts the open reports the viewer can read", async () => {
    const { client } = fakeClient(rows);
    const { people } = await getTreeGraph("t1", client);
    expect(people.map((p) => p.open_report_count)).toEqual([0, 2]);
  });

  it("reads none on a share link", async () => {
    const { client, read } = fakeClient(rows);
    const { people } = await getTreeGraph("t1", client, { forPublic: true });
    expect(people.map((p) => p.open_report_count)).toEqual([0, 0]);
    expect(read).not.toContain("entry_reports");
  });
});

describe("getTreeGraph period place names", () => {
  const TANZANIA = 9_000_008_490;
  const NAIROBI = 184745;
  const person = (id: string, place: Record<string, unknown>) => ({
    id,
    last_name: "Sayani",
    home_tree_id: "t1",
    owner_user_id: "u1",
    created_by: "u1",
    photo_path: null,
    place_id_birth: null,
    place_id_death: null,
    ...place,
  });
  const rows = {
    ...ROWS,
    tree_people: [
      // Born in Tanzania, the town not known (Step 79).
      person("p1", {
        place_id_birth: TANZANIA,
        city_of_birth: null,
        country_of_birth: "Tanzania",
        date_of_birth: "1950-03-01",
      }),
      person("p2", {
        is_deceased: true,
        place_id_death: NAIROBI,
        place_of_death: "Nairobi, Kenya",
        date_of_death: "1955-06-01",
      }),
      person("p3", {
        is_deceased: true,
        place_id_death: TANZANIA,
        place_of_death: "Tanzania",
        date_of_death: "1930-01-01",
      }),
    ],
    claims: [],
    places: [
      { id: TANZANIA, name: "Tanzania", country_code: "TZ", feature_code: "PCL" },
      { id: NAIROBI, name: "Nairobi", country_code: "KE", feature_code: "PPLC" },
    ],
    historical_names: [
      { place_id: null, country_code: "TZ", name: "Tanganyika (British mandate)", start_date: "1919-06-28", end_date: "1961-12-09" },
      { place_id: null, country_code: "KE", name: "Kenya Colony", start_date: "1920-07-23", end_date: "1963-12-12" },
    ],
  };

  it("names a whole country's period name with no town before it", async () => {
    const { client } = fakeClient(rows);
    const { people } = await getTreeGraph("t1", client);
    expect(people[0].birth_place_historical).toBe(
      "Tanganyika (British mandate) · now Tanzania",
    );
    expect(people[2].death_place_historical).toBe(
      "Tanganyika (British mandate) · now Tanzania",
    );
  });

  it("puts the town's own name before a place of death's period name", async () => {
    const { client } = fakeClient(rows);
    const { people } = await getTreeGraph("t1", client);
    expect(people[1].death_place_historical).toBe(
      "Nairobi, Kenya Colony · now Kenya",
    );
  });
});
