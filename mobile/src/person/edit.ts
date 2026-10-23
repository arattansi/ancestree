import {
  ENTRY_EDIT_COLUMNS,
  entryEditChanges,
  type EntryEdit,
  type EntryRow,
  type PlaceChanges,
} from "@/lib/entry-edit";
import { personDisplayName } from "@/lib/person-name";
import { placeText } from "@/lib/place-choice";
import {
  findPlaces,
  formatPlaceLabel,
  PLACE_CANDIDATES,
  PLACE_COLUMNS,
  placePattern,
} from "@/lib/place-lookup";
import { supabase } from "@/auth/supabase";
import type { Family } from "@/family/load";

/**
 * The leaves the member may edit from Settings (Step 203): their own, then
 * the ones they own (`owner_user_id`: those they added, until someone
 * claims one), by name, as the database says they may (`entry_rights`,
 * `can_edit_person`). A placeholder child isn't one: it stays empty until
 * its parent shows it, on the web.
 */
export async function leavesToEdit(family: Family, userId: string): Promise<string[]> {
  const { data: owned, error } = await supabase
    .from("people")
    .select("id")
    .eq("owner_user_id", userId)
    .is("placeholder_number", null);
  if (error) throw new Error("Your leaves couldn't be read.");
  const ids = [...new Set([family.selfId, ...(owned ?? []).map((row) => row.id)])].filter(
    (id) => family.people.has(id),
  );
  if (!ids.length) return [];
  const { data: rights, error: rightsError } = await supabase.rpc("entry_rights", {
    p_people: ids,
  });
  if (rightsError) throw new Error("Your leaves couldn't be read.");
  const editable = new Set((rights ?? []).filter((r) => r.can_edit).map((r) => r.person_id));
  const name = (id: string) => personDisplayName(family.people.get(id)!);
  return ids
    .filter((id) => editable.has(id))
    .sort((a, b) =>
      a === family.selfId ? -1 : b === family.selfId ? 1 : name(a).localeCompare(name(b)),
    );
}

/** An entry to edit, or null when it isn't the member's to edit. */
export async function readEntry(id: string): Promise<EntryRow | null> {
  const [{ data: row, error }, { data: rights, error: rightsError }] = await Promise.all([
    supabase.from("people").select(ENTRY_EDIT_COLUMNS).eq("id", id).maybeSingle(),
    supabase.rpc("entry_rights", { p_people: [id] }),
  ]);
  if (error || rightsError) throw new Error("Couldn't read their details.");
  const mayEdit = (rights ?? []).some((r) => r.person_id === id && r.can_edit);
  return row && mayEdit && row.placeholder_number == null ? row : null;
}

/** Saves the form: null when it's saved, else why not. */
export async function saveEntry(
  id: string,
  edit: EntryEdit,
  places: PlaceChanges,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("people")
    .update(entryEditChanges(edit, places))
    .eq("id", id)
    .select("id");
  if (error) return "Couldn't save. Try again.";
  return data?.length ? null : "Only someone who looks after this entry can change it.";
}

/** A place the search found, as the form shows and keeps it. */
export type PlaceOption = {
  id: number;
  /** "Vancouver, BC, Canada": which one it is. */
  label: string;
  /** What the entry keeps beside its id (`placeText`). */
  city: string;
  country: string;
  kept: string;
};

/** The places a name finds, as the web's picker finds them (Step 66). */
export async function searchPlaces(typed: string): Promise<PlaceOption[]> {
  const hits = await findPlaces(
    typed,
    async (search) => {
      const { data, error } = await supabase
        .from("places")
        .select(PLACE_COLUMNS)
        .ilike("search_name", placePattern(search))
        .order("population", { ascending: false, nullsFirst: false })
        .limit(PLACE_CANDIDATES);
      return error || !data ? [] : data;
    },
    6,
  );
  return hits.map((hit) => {
    const text = placeText(hit);
    return {
      id: hit.id,
      label: formatPlaceLabel(hit),
      city: text.city,
      country: text.country,
      kept: text.label,
    };
  });
}
