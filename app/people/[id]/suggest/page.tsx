import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageColumn } from "@/components/page-column";
import { PersonSuggestForm } from "@/components/person-suggest-form";
import { entryAccess, entryFacts } from "@/lib/entry-access.server";
import { personDisplayName } from "@/lib/person-name";
import { personFormValues } from "@/lib/person-schema";
import { placeLabels } from "@/lib/entry-view.server";
import { createClient } from "@/lib/supabase/server";
import { answeredLine, withChanges } from "@/lib/suggestions";
import {
  getOwnDeclinedSuggestion,
  getOwnPendingSuggestion,
} from "@/lib/suggestions.server";
import { loadTreeEdges } from "@/lib/tree";
import { requireTreeSelfPersonWith } from "@/lib/tree-context";
import {
  editPersonHref,
  entryBackHref,
  openedFromFamily,
  suggestChangeHref,
} from "@/lib/tree-links";

export const metadata: Metadata = { title: "suggest a change" };

/**
 * Suggest a change to an entry the viewer can't edit (Step 67), from the
 * tree they're looking at. Someone who can edit it is sent to edit it.
 * `?from=` starts from one of their suggestions that was declined, to edit
 * and resend (Step 71); `?back=family`, opened from My Family Tree, goes
 * back there (Step 92.3).
 */
export default async function SuggestChangePage({
  params,
  searchParams,
}: PageProps<"/people/[id]/suggest">) {
  const { id } = await params;
  const { from, back } = await searchParams;
  const fromId = typeof from === "string" ? from : undefined;
  const fromFamily = openedFromFamily(back);
  const supabase = await createClient();
  // What needs only the entry's id is asked for with the check that their
  // own entry is on this tree (Step 77.1): the entry, their suggestions on
  // it, who is behind it, and the tree's lines for who may edit it.
  const {
    membership: { tree, profile },
    data: [{ data: person }, pending, declined],
  } = await requireTreeSelfPersonWith(({ tree, profile, type }) =>
    Promise.all([
      supabase
        .from("tree_people")
        .select(
          "id, home_tree_id, first_name, middle_name, preferred_name, maiden_name, last_name, date_of_birth, date_of_birth_precision, birth_month, birth_day, date_of_birth_circa, place_id_birth, city_of_birth, country_of_birth, is_deceased, date_of_death, date_of_death_precision, date_of_death_circa, place_id_death, place_of_death, sex, owner_user_id, created_by",
        )
        .eq("tree_id", tree.id)
        .eq("id", id)
        .maybeSingle(),
      getOwnPendingSuggestion(id, profile.auth_user_id),
      // The one they're resending, or their latest if it was declined.
      getOwnDeclinedSuggestion(id, profile.auth_user_id, fromId),
      entryFacts(id, profile.auth_user_id),
      // A Root edits every entry here, so needs no walk over the lines.
      type.entries === "tree" ? null : loadTreeEdges(tree.id),
    ]),
  );

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

  // Someone who can edit it is sent to edit it; the places are read
  // alongside, needed or not.
  const [{ canEdit }, labels] = await Promise.all([
    entryAccess(profile, {
      id: personId,
      home_tree_id: person.home_tree_id,
      owner_user_id: person.owner_user_id,
      created_by: person.created_by,
    }),
    placeLabels(shown),
  ]);
  if (canEdit) redirect(editPersonHref(personId, { fromFamily }));

  return (
    <PageColumn>
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
              href={suggestChangeHref(personId, declined.id, { fromFamily })}
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
        placeLabels={labels}
        note={startingFrom?.note ?? ""}
        startsFrom={startsFrom}
        backHref={entryBackHref(personId, fromFamily)}
      />
    </PageColumn>
  );
}
