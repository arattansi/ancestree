import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PersonSuggestForm } from "@/components/person-suggest-form";
import { entryAccess } from "@/lib/entry-access.server";
import { personDisplayName } from "@/lib/person-name";
import { personFormValues } from "@/lib/person-schema";
import { formatPlaceLabel, getPlacesByIds } from "@/lib/places";
import { createClient } from "@/lib/supabase/server";
import { answeredLine, withChanges } from "@/lib/suggestions";
import {
  getOwnDeclinedSuggestion,
  getOwnPendingSuggestion,
} from "@/lib/suggestions.server";
import { requireTreeSelfPerson } from "@/lib/tree-context";
import {
  editPersonHref,
  suggestChangeHref,
  treeFocusHref,
} from "@/lib/tree-links";

export const metadata: Metadata = { title: "suggest a change" };

/**
 * Suggest a change to an entry the viewer can't edit (Step 67), from the
 * tree they're looking at. Someone who can edit it is sent to edit it.
 * `?from=` starts from one of their suggestions that was declined, to edit
 * and resend (Step 71).
 */
export default async function SuggestChangePage({
  params,
  searchParams,
}: PageProps<"/people/[id]/suggest">) {
  const { id } = await params;
  const { from } = await searchParams;
  const fromId = typeof from === "string" ? from : undefined;
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

  const [{ canEdit }, pending, declined] = await Promise.all([
    entryAccess(profile, {
      id: personId,
      home_tree_id: person.home_tree_id,
      owner_user_id: person.owner_user_id,
      created_by: person.created_by,
    }),
    getOwnPendingSuggestion(personId, profile.auth_user_id),
    // The one they're resending, or their latest if it was declined.
    getOwnDeclinedSuggestion(personId, profile.auth_user_id, fromId),
  ]);
  if (canEdit) redirect(editPersonHref(personId));

  // What the form opens with: a declined suggestion they're resending, or
  // their earlier one while it waits (sending again replaces it), or the
  // entry as it stands.
  const resend = fromId ? declined : null;
  const startsFrom = resend ? "declined" : pending ? "pending" : "entry";
  const startingFrom = resend ?? pending;
  const entry = { ...person, last_name: person.last_name };
  const shown = startingFrom
    ? withChanges(entry, startingFrom.changes)
    : entry;
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
        {resend ? (
          <p className="text-sm text-muted-foreground">
            {answeredLine({
              status: "declined",
              decidedBy: resend.declinedBy,
              declineReason: resend.declineReason,
            })}
          </p>
        ) : null}
        {pending ? (
          <p className="text-sm text-muted-foreground">
            Your earlier suggestion is still waiting. Sending this replaces it.
          </p>
        ) : declined && !resend ? (
          <p className="text-sm text-muted-foreground">
            Your last suggestion was declined.{" "}
            <Link
              href={suggestChangeHref(personId, declined.id)}
              className="text-foreground underline underline-offset-2"
            >
              Edit and resend it
            </Link>
          </p>
        ) : null}
      </div>

      <PersonSuggestForm
        // A form keeps what it opened with, so a new starting point (the
        // hint's link, on this same page) opens a new one.
        key={startingFrom?.id ?? "entry"}
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
        note={startingFrom?.note ?? ""}
        startsFrom={startsFrom}
        backHref={treeFocusHref(personId)}
      />
    </main>
  );
}
