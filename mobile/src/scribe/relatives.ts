import type { SupabaseClient } from "@supabase/supabase-js";

import {
  detectionTree,
  type DetectionTree,
} from "@/lib/connection-suggestions";
import { refToString } from "@/lib/connections";
import type { Database, Json, TablesUpdate } from "@/lib/database.types";
import type { RelativeProposal } from "@/lib/scribe-facts";
import {
  isCheckSaid,
  judgeRelative,
  readRelativeRefusal,
  relativeAfter,
  relativeEdges,
  relativeName,
  relativeRow,
  relativeSuggestions,
  type Judged,
  type RelativeDraft,
} from "@/lib/scribe-relatives";

/**
 * The trips adding the scribe's relatives takes (Step 148.3), each as the
 * member: reading the tree they'd join, for the connections it implies;
 * asking the database whether adding them would go, nothing kept
 * (`check_add_people_with_connections`); and adding them as the web's "Add
 * a relative" does. Each takes the app's one client (`@/auth/supabase`).
 */

type DbClient = SupabaseClient<Database>;

/** How many rows PostgREST answers with at most (the project's `max_rows`). */
const PAGE = 1000;

async function readPaged<T>(
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw new Error("The tree couldn't be read.");
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return rows;
  }
}

/**
 * The tree someone is added to, as the connection engine reasons over it:
 * the same reads the web makes for its add form
 * (`lib/connection-suggestions.server.ts`).
 */
export async function loadDetectionTree(
  supabase: DbClient,
  treeId: string,
): Promise<DetectionTree> {
  const [people, edges, answered, nicknames] = await Promise.all([
    readPaged((from, to) =>
      supabase
        .from("tree_people")
        .select(
          "id, first_name, preferred_name, last_name, placeholder_number, date_of_birth",
        )
        .eq("tree_id", treeId)
        .order("id")
        .range(from, to),
    ),
    readPaged((from, to) =>
      supabase
        .from("tree_edges")
        .select(
          "id, from_person, to_person, type, marriage_date, divorce_date, is_divorced",
        )
        .eq("tree_id", treeId)
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("connection_suggestions")
      .select("subject_person_id, related_person_id, suggested_type, source")
      .eq("tree_id", treeId)
      .neq("status", "pending"),
    supabase.from("name_nicknames").select("variant, canonical"),
  ]);
  if (answered.error || nicknames.error)
    throw new Error("The tree couldn't be read.");
  return detectionTree({
    people,
    edges,
    answered: answered.data ?? [],
    nicknames: nicknames.data ?? [],
  });
}

/** Their one line, as the add takes it. */
const edgesOf = (r: RelativeProposal) =>
  relativeEdges(r).map((e) => ({
    type: e.type,
    a: refToString(e.a),
    b: refToString(e.b),
  }));

/**
 * What the database says to adding them, nothing kept: whether it would
 * go once those it asks about say yes (`judgeRelative`), or why not.
 * Throws when it couldn't be asked.
 */
export async function judge(
  supabase: DbClient,
  r: RelativeProposal,
  draft: RelativeDraft,
  treeId: string,
  suggestions: ReturnType<typeof relativeSuggestions>,
  asked: readonly string[],
): Promise<Judged> {
  return judgeRelative(
    async (adultIds) => {
      const { data, error } = await supabase.rpc(
        "check_add_people_with_connections",
        {
          // A yes to "18 or older?", so the rest is judged; a no is refused
          // on the phone.
          p_people: [relativeRow(r, draft, true)] as Json,
          p_edges: edgesOf(r) as Json,
          p_suggestions: suggestions as Json,
          p_tree: treeId,
          p_adult_existing: adultIds,
        },
      );
      if (error || !isCheckSaid(data)) throw new Error("Couldn't check them.");
      return data;
    },
    asked,
    relativeName(draft),
  );
}

/**
 * Add them as ticked and answered, then set what the call doesn't take, as
 * the web does: null once they're on the tree, else why not.
 */
export async function addRelative(
  supabase: DbClient,
  input: {
    r: RelativeProposal;
    draft: RelativeDraft;
    treeId: string;
    suggestions: ReturnType<typeof relativeSuggestions>;
    /** Their answer to "18 or older?", where it was asked. */
    adult: boolean | null;
    /** Those on the tree a line asked about, who said yes. */
    adultIds: string[];
  },
): Promise<string | null> {
  const { r, draft } = input;
  const { data, error } = await supabase.rpc("add_people_with_connections", {
    p_people: [relativeRow(r, draft, input.adult)] as Json,
    p_edges: edgesOf(r) as Json,
    p_suggestions: input.suggestions as Json,
    p_tree: input.treeId,
    ...(input.adultIds.length ? { p_adult_existing: input.adultIds } : {}),
  });
  if (error || !data) {
    const read = readRelativeRefusal(error, relativeName(draft));
    return "error" in read ? read.error : "Couldn’t add them.";
  }
  const id = (data as { ids?: string[] }).ids?.[0];
  const after = relativeAfter(r);
  if (id && after) {
    // On the tree either way: a place or "c." that doesn't take isn't worth
    // saying they weren't added.
    await supabase
      .from("people")
      .update(after as TablesUpdate<"people">)
      .eq("id", id);
  }
  return null;
}
