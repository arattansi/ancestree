import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { scribeContext, scribePrompt, writeUp, type ScribeContext } from "@/lib/scribe.server";

const ID = "4b8f3c2e-1d2a-4c5b-9e8f-0a1b2c3d4e5f";
const SELF = "11111111-1111-4111-8111-111111111111";
const MUM = "22222222-2222-4222-8222-222222222222";

const CONTEXT: ScribeContext = {
  about: "Amarshi Sayani",
  recordedBy: "Aalim Rattansi",
  names: ["Aalim Rattansi", "Fatma Sayani"],
};

describe("scribePrompt", () => {
  it("says whose leaf, who recorded it, the names, the language, then what was heard", () => {
    expect(
      scribePrompt({ personId: ID, heard: "we came by boat", locale: "en-GB" }, CONTEXT),
    ).toBe(
      [
        "The story is told on Amarshi Sayani's leaf of the family tree.",
        "Aalim Rattansi recorded it.",
        "Family names that may come up: Aalim Rattansi; Fatma Sayani.",
        "The phone listened for en-GB.",
        "",
        "<heard>",
        "we came by boat",
        "</heard>",
      ].join("\n"),
    );
  });

  it("says when it was typed, and leaves out a recorder who is the leaf", () => {
    const prompt = scribePrompt(
      { personId: ID, heard: "hello", locale: null },
      { about: "Aalim Rattansi", recordedBy: "Aalim Rattansi", names: [] },
    );
    expect(prompt).toContain("It was typed, or dictated with the phone's keyboard.");
    expect(prompt).not.toContain("recorded it");
    expect(prompt).not.toContain("Family names");
  });
});

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

describe("writeUp", () => {
  it("asks Sonnet, with fallbacks, and hands back the draft tidied", async () => {
    const { client, asked } = fakeClient({
      model: "claude-sonnet-5-5",
      stop_reason: "end_turn",
      usage: USAGE,
      parsed_output: {
        title: " The boat ",
        language: "Gujarati",
        story: " અમે વહાણમાં આવ્યા. ",
        english: " We came by boat. ",
      },
    });
    const draft = await writeUp({ personId: ID, heard: "x", locale: "gu-IN" }, CONTEXT, client);
    expect(draft).toEqual({
      title: "The boat",
      language: "Gujarati",
      story: "અમે વહાણમાં આવ્યા.",
      english: "We came by boat.",
    });
    expect(asked[0]).toMatchObject({
      model: "claude-sonnet-5-5",
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
      output_config: { effort: "low" },
    });
  });

  it("drops an English that only repeats the story", async () => {
    const { client } = fakeClient({
      model: "claude-sonnet-5-5",
      stop_reason: "end_turn",
      usage: USAGE,
      parsed_output: { title: "T", language: "English", story: "We came.", english: "We came." },
    });
    const draft = await writeUp({ personId: ID, heard: "x", locale: "en-US" }, CONTEXT, client);
    expect(draft).toMatchObject({ english: null });
  });

  it("says why there's no draft", async () => {
    const refused = fakeClient({ model: "m", stop_reason: "refusal", usage: USAGE, parsed_output: null });
    expect(await writeUp({ personId: ID, heard: "x", locale: null }, CONTEXT, refused.client)).toBe(
      "refused",
    );
    const long = fakeClient({ model: "m", stop_reason: "max_tokens", usage: USAGE, parsed_output: null });
    expect(await writeUp({ personId: ID, heard: "x", locale: null }, CONTEXT, long.client)).toBe(
      "too-long",
    );
    const empty = fakeClient({
      model: "m",
      stop_reason: "end_turn",
      usage: USAGE,
      parsed_output: { title: "T", language: "English", story: " ", english: null },
    });
    expect(await writeUp({ personId: ID, heard: "x", locale: null }, CONTEXT, empty.client)).toBe(
      "failed",
    );
  });
});

/** Reads that answer from fixed rows, as RLS would let the member see them. */
function fakeSupabase(rows: {
  people: Record<string, unknown>[];
  selfId: string | null;
  lines: { from_person: string; to_person: string }[];
}) {
  const table = (name: string) => {
    const filters: Record<string, unknown> = {};
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      in: (column: string, values: string[]) => {
        filters[column] = values;
        return builder;
      },
      or: () => builder,
      limit: () => builder,
      maybeSingle: async () => {
        if (name === "profiles") return { data: { self_person_id: rows.selfId } };
        const found = rows.people.find(
          (p) => p.id === filters.id && (filters.detail === undefined || p.detail === filters.detail),
        );
        return { data: found ?? null };
      },
      then: (resolve: (value: unknown) => void) => {
        if (name === "tree_edges") return resolve({ data: rows.lines });
        const ids = filters.id as string[];
        return resolve({ data: rows.people.filter((p) => ids.includes(p.id as string)) });
      },
    };
    return builder;
  };
  return { from: table } as never;
}

describe("scribeContext", () => {
  const person = (id: string, first: string, last: string, extra: object = {}) => ({
    id,
    first_name: first,
    middle_name: null,
    preferred_name: null,
    maiden_name: null,
    last_name: last,
    placeholder_number: null,
    detail: "full",
    ...extra,
  });

  it("names the leaf, the recorder and the family one line away", async () => {
    const supabase = fakeSupabase({
      people: [
        person(ID, "Amarshi", "Sayani"),
        person(SELF, "Aalim", "Rattansi"),
        person(MUM, "Fatma", "Sayani", { preferred_name: "Fati", maiden_name: "Lalani" }),
      ],
      selfId: SELF,
      lines: [{ from_person: ID, to_person: MUM }],
    });
    expect(await scribeContext(supabase, "user", ID)).toEqual({
      about: "Amarshi Sayani",
      recordedBy: "Aalim Rattansi",
      names: ["Aalim Rattansi", "Fatma (Fati) Sayani née Lalani"],
    });
  });

  it("is nothing when the member can't see the person in full", async () => {
    const supabase = fakeSupabase({
      people: [person(ID, "Amarshi", "Sayani", { detail: "basic" })],
      selfId: SELF,
      lines: [],
    });
    expect(await scribeContext(supabase, "user", ID)).toBeNull();
  });
});
