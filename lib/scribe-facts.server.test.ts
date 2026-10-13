import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const searchPlaces = vi.fn();
vi.mock("@/lib/places", () => ({ searchPlaces: (...args: unknown[]) => searchPlaces(...args) }));

import {
  entryRights,
  factsRoster,
  findFacts,
  findPlaces,
} from "@/lib/scribe-facts.server";
import { buildRoster, type FactsSaid, type RosterRow } from "@/lib/scribe-roster";

const LEAF = "00000000-0000-4000-8000-000000000001";
const SELF = "00000000-0000-4000-8000-000000000002";
const TODAY = new Date("2026-10-13T12:00:00Z");

const row = (id: string, first: string, extra: Partial<RosterRow> = {}): RosterRow => ({
  id,
  first_name: first,
  middle_name: null,
  preferred_name: null,
  maiden_name: null,
  last_name: "Jaffer",
  placeholder_number: null,
  sex: null,
  date_of_birth: null,
  date_of_birth_precision: null,
  birth_month: null,
  birth_day: null,
  date_of_birth_circa: false,
  place_id_birth: null,
  city_of_birth: null,
  country_of_birth: null,
  is_deceased: false,
  date_of_death: null,
  date_of_death_precision: null,
  date_of_death_circa: false,
  place_id_death: null,
  place_of_death: null,
  ...extra,
});

const ROSTER = buildRoster({
  rows: [row(LEAF, "Hassan"), row(SELF, "Karim")],
  lines: [{ from_person: LEAF, to_person: SELF, type: "parent" }],
  leafId: LEAF,
  recorderId: SELF,
})!;

const SAID: FactsSaid = { facts: [], mentioned: ["P2"], new_relatives: [] };

/** A client whose stream answers with `message`, keeping what it was asked. */
function fakeClient(message: object) {
  const asked: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        stream: (params: Record<string, unknown>) => {
          asked.push(params);
          return { finalMessage: async () => message };
        },
      },
    },
  };
  return { client: client as never, asked };
}

const USAGE = { input_tokens: 10, output_tokens: 20 };

describe("findFacts", () => {
  it("asks Sonnet at medium effort, with fallbacks, given the family and what was heard", async () => {
    const { client, asked } = fakeClient({
      model: "claude-sonnet-5-5",
      stop_reason: "end_turn",
      usage: USAGE,
      parsed_output: SAID,
    });
    const said = await findFacts({ personId: LEAF, heard: "dada was born in mombasa", locale: "en-CA" }, ROSTER, TODAY, client);
    expect(said).toEqual(SAID);
    expect(asked[0]).toMatchObject({
      model: "claude-sonnet-5-5",
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
      output_config: { effort: "medium" },
    });
    const content = (asked[0].messages as { content: string }[])[0].content;
    expect(content).toContain("P1 · Hassan Jaffer · the leaf · the recorder's parent");
    expect(content).toContain("<heard>\ndada was born in mombasa\n</heard>");
  });

  it("says why there's nothing", async () => {
    const ask = (stop: string, parsed: unknown) =>
      findFacts(
        { personId: LEAF, heard: "x", locale: null },
        ROSTER,
        TODAY,
        fakeClient({ model: "m", stop_reason: stop, usage: USAGE, parsed_output: parsed }).client,
      );
    expect(await ask("refusal", null)).toBe("refused");
    expect(await ask("max_tokens", null)).toBe("too-long");
    expect(await ask("end_turn", null)).toBe("failed");
  });
});

describe("findPlaces", () => {
  beforeEach(() => searchPlaces.mockReset());

  const said = (place: { town: string | null; region: string | null; country: string | null }): FactsSaid => ({
    facts: [
      {
        evidence: "",
        person: "P1",
        event: "birth",
        year: null,
        month: null,
        day: null,
        circa: false,
        place,
      },
    ],
    mentioned: [],
    new_relatives: [],
  });

  it("takes the first match in the country the story named", async () => {
    searchPlaces.mockResolvedValue([
      { id: 1, name: "Kutchan", admin1_code: null, country_code: "JP", is_country: false },
      { id: 2, name: "Dhrol", admin1_code: null, country_code: "IN", is_country: false },
    ]);
    const found = await findPlaces({} as never, said({ town: "Dhrol", region: "Gujarat", country: "India" }));
    expect(searchPlaces).toHaveBeenCalledWith("Dhrol, Gujarat, India", 8, {});
    expect(found.get("Dhrol, Gujarat, India")).toEqual({ id: 2, city: "Dhrol", country: "India", label: "Dhrol, India" });
  });

  it("falls back to the country when nothing there matches, and needs no search for a country alone", async () => {
    searchPlaces.mockResolvedValue([
      { id: 1, name: "Kutchan", admin1_code: null, country_code: "JP", is_country: false },
    ]);
    const found = await findPlaces({} as never, said({ town: null, region: "Kutch", country: "India" }));
    expect(found.get("Kutch, India")).toBeNull();
    expect(found.get("India")).toMatchObject({ city: "", country: "India", label: "India" });

    searchPlaces.mockReset();
    const alone = await findPlaces({} as never, said({ town: null, region: null, country: "Tanganyika" }));
    expect(searchPlaces).not.toHaveBeenCalled();
    expect(alone.get("Tanganyika")).toMatchObject({ country: "Tanzania" });
  });

  it("takes the top match when no country was named", async () => {
    searchPlaces.mockResolvedValue([
      { id: 7, name: "Mombasa", admin1_code: null, country_code: "KE", is_country: false },
    ]);
    const found = await findPlaces({} as never, said({ town: "Mombasa", region: null, country: null }));
    expect(found.get("Mombasa")).toMatchObject({ id: 7, label: "Mombasa, Kenya" });
  });
});

describe("entryRights", () => {
  it("asks entry_rights for the people named, as the member", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { person_id: LEAF, can_edit: false, can_fill: true, suggest_tree: "t1" },
        { person_id: SELF, can_edit: true, can_fill: false, suggest_tree: null },
      ],
      error: null,
    });
    const rights = await entryRights({ rpc } as never, [LEAF, SELF]);
    expect(rpc).toHaveBeenCalledWith("entry_rights", { p_people: [LEAF, SELF] });
    expect(rights.get(LEAF)).toEqual({ canEdit: false, canFill: true, suggestTree: "t1" });
    expect(rights.get(SELF)).toEqual({ canEdit: true, canFill: false, suggestTree: null });
    expect((await entryRights({ rpc } as never, [])).size).toBe(0);
  });
});

/** Reads that answer from fixed rows, as RLS would let the member see them. */
function fakeSupabase(rows: {
  people: Record<string, unknown>[];
  lines: Record<string, unknown>[];
  selfId: string | null;
  trees: string[];
}) {
  const table = (name: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      range: async () => ({ data: name === "tree_edges" ? rows.lines : rows.people, error: null }),
      maybeSingle: async () => ({ data: { self_person_id: rows.selfId } }),
      then: (resolve: (value: unknown) => void) => resolve({ data: rows.trees.map((id) => ({ id })) }),
    };
    return builder;
  };
  return { from: table } as never;
}

describe("factsRoster", () => {
  it("reads one row a person, from their home tree where it can, and each line once", async () => {
    const supabase = fakeSupabase({
      people: [
        { ...row(LEAF, "Hassan"), tree_id: "a", is_home: false },
        { ...row(LEAF, "Hassan", { place_of_death: "Toronto, Canada" }), tree_id: "b", is_home: true },
        { ...row(SELF, "Karim"), tree_id: "a", is_home: true },
        { ...row("00000000-0000-4000-8000-000000000003", "", { last_name: null }), tree_id: "a", is_home: true },
      ],
      lines: [
        { tree_id: "a", id: "l1", from_person: LEAF, to_person: SELF, type: "parent", is_divorced: false },
        { tree_id: "b", id: "l1", from_person: LEAF, to_person: SELF, type: "parent", is_divorced: false },
      ],
      selfId: SELF,
      trees: ["a", "b"],
    });
    const roster = await factsRoster(supabase, "user", LEAF);
    expect(roster?.people.map((p) => [p.ref, p.row.first_name, p.toLeaf])).toEqual([
      ["P1", "Hassan", null],
      ["P2", "Karim", "child"],
    ]);
    expect(roster?.leaf.row.place_of_death).toBe("Toronto, Canada");
    expect(roster?.recorder?.ref).toBe("P2");
  });

  it("is nothing on no tree, or when the leaf isn't shown in full", async () => {
    const empty = fakeSupabase({ people: [], lines: [], selfId: SELF, trees: [] });
    expect(await factsRoster(empty, "user", LEAF)).toBeNull();
    const elsewhere = fakeSupabase({
      people: [{ ...row(SELF, "Karim"), tree_id: "a", is_home: true }],
      lines: [],
      selfId: SELF,
      trees: ["a"],
    });
    expect(await factsRoster(elsewhere, "user", LEAF)).toBeNull();
  });
});
