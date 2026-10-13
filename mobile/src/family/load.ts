import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/** Someone the app can draw as a leaf or a circle. */
export type FamilyPerson = {
  id: string;
  first_name: string | null;
  middle_name: string | null;
  preferred_name: string | null;
  maiden_name: string | null;
  last_name: string | null;
  placeholder_number: number | null;
  date_of_birth: string | null;
  date_of_death: string | null;
  date_of_birth_precision: string | null;
  date_of_death_precision: string | null;
  birth_month: number | null;
  birth_day: number | null;
  date_of_birth_circa: boolean | null;
  date_of_death_circa: boolean | null;
  is_deceased: boolean | null;
  city_of_birth: string | null;
  country_of_birth: string | null;
  sex: string | null;
  /** Only a name and a place of birth, waiting on a yes (Step 80). */
  basic: boolean;
};

export type FamilyLine = {
  id: string;
  from_person: string;
  to_person: string;
  type: string;
  is_divorced: boolean;
};

export type Family = {
  /** The member's own entry: where the app opens. */
  selfId: string;
  displayName: string | null;
  people: Map<string, FamilyPerson>;
  lines: FamilyLine[];
};

/** Why there's no family to draw. */
export type NoFamily = "no-profile" | "no-entry" | "no-tree";

const PERSON_COLUMNS =
  "tree_id, id, home_tree_id, is_home, detail, blurred, first_name, middle_name, preferred_name, maiden_name, last_name, placeholder_number, date_of_birth, date_of_death, date_of_birth_precision, date_of_death_precision, birth_month, birth_day, date_of_birth_circa, date_of_death_circa, is_deceased, city_of_birth, country_of_birth, sex";
const LINE_COLUMNS = "tree_id, id, from_person, to_person, type, is_divorced";

/** How many rows PostgREST answers with at most (the project's `max_rows`). */
const PAGE = 1000;

async function readPaged<T>(
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw new Error("Your trees couldn't be read.");
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return rows;
  }
}

/**
 * Everyone on every tree the member belongs to, one entry each, and the
 * lines between them: the same `tree_people` and `tree_edges` reads My
 * Family Tree takes on the web (`lib/my-family.server.ts`), bounded by the
 * same RLS. A leaf walks the lot, not only the blood line.
 *
 * Someone on two trees is read from their home tree when it is one of the
 * member's, else from a tree that shows them in full, else as a basic card,
 * as the web picks (`cardShowing`). Blurred rows are a visitor's, never a
 * member's, and anything nameless isn't a person (`cardOf`).
 */
export async function loadFamily(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Family | NoFamily> {
  const readProfile = () =>
    supabase
      .from("profiles")
      .select("display_name, self_person_id")
      .eq("auth_user_id", userId)
      .maybeSingle();
  let [{ data: profile }, { data: trees }] = await Promise.all([
    readProfile(),
    supabase.from("my_trees").select("id").order("joined_at"),
  ]);
  if (!profile) {
    // What the web does after a code sign-in (`establishMembership`): make
    // the profile an accepted invite or a tree of their own entitles them to.
    const { error } = await supabase.rpc("ensure_profile", {});
    if (error) return "no-profile";
    [{ data: profile }, { data: trees }] = await Promise.all([
      readProfile(),
      supabase.from("my_trees").select("id").order("joined_at"),
    ]);
    if (!profile) return "no-profile";
  }
  if (!profile.self_person_id) return "no-entry";
  const treeIds = (trees ?? []).flatMap((t) => (t.id ? [t.id] : []));
  if (treeIds.length === 0) return "no-tree";

  const [personRows, lineRows] = await Promise.all([
    readPaged((from, to) =>
      supabase
        .from("tree_people")
        .select(PERSON_COLUMNS)
        .in("tree_id", treeIds)
        .order("tree_id")
        .order("id")
        .range(from, to),
    ),
    readPaged((from, to) =>
      supabase
        .from("tree_edges")
        .select(LINE_COLUMNS)
        .in("tree_id", treeIds)
        .order("tree_id")
        .order("id")
        .range(from, to),
    ),
  ]);

  const rank = (row: (typeof personRows)[number]) =>
    row.detail === "basic" ? 2 : row.is_home ? 0 : 1;
  const chosen = new Map<string, (typeof personRows)[number]>();
  for (const row of personRows) {
    if (!row.id || row.blurred) continue;
    if (!row.last_name && row.placeholder_number == null) continue;
    const seen = chosen.get(row.id);
    if (!seen || rank(row) < rank(seen)) chosen.set(row.id, row);
  }
  const people = new Map<string, FamilyPerson>();
  for (const [id, row] of chosen) {
    people.set(id, {
      id,
      first_name: row.first_name,
      middle_name: row.middle_name,
      preferred_name: row.preferred_name,
      maiden_name: row.maiden_name,
      last_name: row.last_name,
      placeholder_number: row.placeholder_number,
      date_of_birth: row.date_of_birth,
      date_of_death: row.date_of_death,
      date_of_birth_precision: row.date_of_birth_precision,
      date_of_death_precision: row.date_of_death_precision,
      birth_month: row.birth_month,
      birth_day: row.birth_day,
      date_of_birth_circa: row.date_of_birth_circa,
      date_of_death_circa: row.date_of_death_circa,
      is_deceased: row.is_deceased,
      city_of_birth: row.city_of_birth,
      country_of_birth: row.country_of_birth,
      sex: row.sex,
      basic: row.detail === "basic",
    });
  }
  if (!people.has(profile.self_person_id)) return "no-tree";

  // Lines are facts across trees: each tree's copy of one is the same line.
  const lines = new Map<string, FamilyLine>();
  for (const r of lineRows) {
    if (!r.id || !r.from_person || !r.to_person || !r.type) continue;
    if (!people.has(r.from_person) || !people.has(r.to_person)) continue;
    const seen = lines.get(r.id);
    if (seen) seen.is_divorced ||= !!r.is_divorced;
    else
      lines.set(r.id, {
        id: r.id,
        from_person: r.from_person,
        to_person: r.to_person,
        type: r.type,
        is_divorced: !!r.is_divorced,
      });
  }

  return {
    selfId: profile.self_person_id,
    displayName: profile.display_name,
    people,
    lines: [...lines.values()],
  };
}
