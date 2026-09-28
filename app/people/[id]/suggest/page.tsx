import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PersonSuggestForm } from "@/components/person-suggest-form";
import { entryAccess } from "@/lib/entry-access.server";
import { personDisplayName } from "@/lib/person-name";
import { personFormValues } from "@/lib/person-schema";
import { formatPlaceLabel, getPlacesByIds } from "@/lib/places";
import { createClient } from "@/lib/supabase/server";
import { withChanges } from "@/lib/suggestions";
import { getOwnPendingSuggestion } from "@/lib/suggestions.server";
import { requireTreeSelfPerson } from "@/lib/tree-context";
import { editPersonHref, treeFocusHref } from "@/lib/tree-links";

export const metadata: Metadata = { title: "suggest a change" };

/**
 * Suggest a change to an entry the viewer can't edit (Step 67), from the
 * tree they're looking at. Someone who can edit it is sent to edit it.
 */
export default async function SuggestChangePage({
  params,
}: PageProps<"/people/[id]/suggest">) {
  const { id } = await params;
  const { tree, profile } = await requireTreeSelfPerson();

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("tree_people")
    .select(
      "id, home_tree_id, first_name, middle_name, preferred_name, maiden_name, last_name, date_of_birth, date_of_birth_precision, birth_month, birth_day, place_id_birth, city_of_birth, country_of_birth, is_deceased, date_of_death, date_of_death_precision, place_id_death, place_of_death, sex, owner_user_id, created_by",
    )
    .eq("tree_id", tree.id)
    .eq("id", id)
    .maybeSingle();

  if (
    !person?.id ||
    !person.last_name ||
    !person.home_tree_id ||
    !person.owner_user_id ||
    !person.created_by
  ) {
    notFound();
  }
  const personId = person.id;

  const [{ canEdit }, pending] = await Promise.all([
    entryAccess(profile, {
      id: personId,
      home_tree_id: person.home_tree_id,
      owner_user_id: person.owner_user_id,
      created_by: person.created_by,
    }),
    getOwnPendingSuggestion(personId, profile.auth_user_id),
  ]);
  if (canEdit) redirect(editPersonHref(personId));

  // Their earlier suggestion, while it waits, is what the form opens with:
  // sending again replaces it.
  const entry = { ...person, last_name: person.last_name };
  const shown = pending ? withChanges(entry, pending.changes) : entry;
  const values = personFormValues({
    ...shown,
    lineage_type: null,
    email: null,
    email_visible: false,
  });

  const placeMap = await getPlacesByIds(
    [shown.place_id_birth, shown.place_id_death].filter(
      (n): n is number => typeof n === "number",
    ),
  );
  const birthPlace =
    shown.place_id_birth != null ? placeMap.get(shown.place_id_birth) : null;
  const deathPlace =
    shown.place_id_death != null ? placeMap.get(shown.place_id_death) : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Suggest a Change to {personDisplayName(entry)}
        </h1>
        {pending ? (
          <p className="text-sm text-muted-foreground">
            Your earlier suggestion is still waiting. Sending this replaces it.
          </p>
        ) : null}
      </div>

      <PersonSuggestForm
        treeId={tree.id}
        personId={personId}
        values={values}
        placeLabels={{
          birth: birthPlace
            ? formatPlaceLabel(birthPlace)
            : shown.city_of_birth,
          death: deathPlace
            ? formatPlaceLabel(deathPlace)
            : shown.place_of_death,
        }}
        pendingNote={pending ? (pending.note ?? "") : null}
        backHref={treeFocusHref(personId)}
      />
    </main>
  );
}
