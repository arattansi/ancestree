import "server-only";

import { listAlbum } from "@/lib/album";
import { listEntryReports } from "@/lib/entry-reports";
import type { HeldBackDetails } from "@/lib/held-back";
import type {
  PersonSheet,
  PersonSheetAnswer,
  PersonTreeLink,
  SheetSection,
} from "@/lib/person-sheet";
import { listStories } from "@/lib/stories";
import { createClient } from "@/lib/supabase/server";

/**
 * The trees a person is shown on that the viewer may open (Step 25): as a
 * member, or as a visitor where the tree has been opened to one of theirs.
 * RLS on `trees` is what decides; a tree the viewer can't see isn't listed.
 */
async function personTrees(personId: string): Promise<PersonTreeLink[]> {
  const supabase = await createClient();
  const [{ data: placements }, { data: mine }] = await Promise.all([
    supabase
      .from("tree_placements")
      .select("tree_id, trees(id, name, slug)")
      .eq("person_id", personId)
      .eq("status", "active"),
    supabase.from("my_trees").select("id"),
  ]);
  const member = new Set((mine ?? []).map((t) => t.id));
  return (placements ?? []).flatMap((p) => {
    const t = Array.isArray(p.trees) ? p.trees[0] : p.trees;
    if (!t?.id || !t.name || !t.slug) return [];
    return [{ id: t.id, name: t.name, slug: t.slug, visitor: !member.has(t.id) }];
  });
}

/**
 * A placeholder's held-back details (Step 98.3), as `withheld_details`
 * answers the viewer: only its parent, or the child themself, gets any.
 */
async function heldBack(personId: string): Promise<HeldBackDetails> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("withheld_details", {
    p_person: personId,
  });
  if (error) throw error;
  return (data as HeldBackDetails | null) ?? {};
}

/**
 * The sheet's sections for one person, read side by side, each as the
 * viewer through RLS, the same reads the sheet made one action at a time
 * before Step 87.6. One that fails is named, and the rest still arrive.
 */
export async function loadPersonSheet(
  personId: string,
  sections: readonly SheetSection[],
  viewerId: string,
): Promise<PersonSheetAnswer> {
  const readers: {
    [S in SheetSection]: () => Promise<NonNullable<PersonSheet[S]>>;
  } = {
    trees: () => personTrees(personId),
    reports: () => listEntryReports(personId, viewerId),
    album: () => listAlbum(personId, viewerId),
    stories: () => listStories(personId, viewerId),
    heldBack: () => heldBack(personId),
  };
  const read = await Promise.allSettled(sections.map((s) => readers[s]()));
  const sheet: PersonSheet = {};
  const failed: SheetSection[] = [];
  sections.forEach((section, i) => {
    const got = read[i];
    if (got.status === "fulfilled") {
      Object.assign(sheet, { [section]: got.value });
    } else {
      failed.push(section);
    }
  });
  return { sheet, failed };
}
