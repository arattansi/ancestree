import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageColumn } from "@/components/page-column";
import { PersonFillForm } from "@/components/person-fill-form";
import { PersonForm } from "@/components/person-form";
import {
  EditConnections,
  type ConnectionKind,
  type ExistingConnection,
} from "@/components/tree/edit-connections";
import { Button } from "@/components/ui/button";
import { canEditConnection } from "@/lib/branch";
import { getViewer } from "@/lib/branch.server";
import { entryAccess, entryFacts } from "@/lib/entry-access.server";
import { blankFields } from "@/lib/fill-blanks";
import { personDisplayName } from "@/lib/person-name";
import {
  placeLabels as entryPlaceLabels,
  signedPhotoUrl,
} from "@/lib/entry-view.server";
import { personFormValues } from "@/lib/person-schema";
import { createClient } from "@/lib/supabase/server";
import { listTreeMembers, loadTreeEdges } from "@/lib/tree";
import { getTreeById, requireTreeSelfPersonWith } from "@/lib/tree-context";
import { suggestChangeHref, treeFocusHref } from "@/lib/tree-links";

export const metadata: Metadata = { title: "edit entry" };

export default async function EditPersonPage({
  params,
}: PageProps<"/people/[id]/edit">) {
  const { id } = await params;
  const supabase = await createClient();
  // Everything that needs only the entry's id and the tree is asked for
  // with the check that their own entry is on this tree (Step 77.1): the
  // entry, the tree's people and lines (the connections below, and who
  // may edit what), and who is behind the entry.
  const {
    membership: { tree, profile, type },
    data: [{ data: person }, allMembers],
  } = await requireTreeSelfPersonWith(({ tree, profile }) =>
    Promise.all([
      supabase
        .from("tree_people")
        .select(
          "id, home_tree_id, is_home, first_name, middle_name, preferred_name, maiden_name, last_name, date_of_birth, date_of_birth_precision, birth_month, birth_day, date_of_birth_circa, place_id_birth, city_of_birth, country_of_birth, is_deceased, date_of_death, date_of_death_precision, date_of_death_circa, place_id_death, place_of_death, sex, lineage_type, photo_path, photo_crop, owner_user_id, created_by, email, email_visible",
        )
        .eq("tree_id", tree.id)
        .eq("id", id)
        .maybeSingle(),
      // The tree's people and, shared, its lines.
      listTreeMembers(tree.id),
      entryFacts(id, profile.auth_user_id),
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
  const homeTreeId = person.home_tree_id;

  // Not theirs to change, but maybe theirs to fill in where it's blank
  // (Step 44). Neither, and they can suggest a change instead (Step 67):
  // "Edit entry" on a card whose home is a tree they don't run lands there.
  // The form's photo and places are read alongside, needed or not.
  const [
    { canEdit, canFill, homeRole },
    homeTree,
    photoUrl,
    placeLabels,
    treeViewer,
  ] = await Promise.all([
    entryAccess(profile, {
      id: personId,
      home_tree_id: homeTreeId,
      owner_user_id: person.owner_user_id,
      created_by: person.created_by,
    }),
    person.is_home ? tree : getTreeById(homeTreeId),
    signedPhotoUrl(supabase, person.photo_path),
    entryPlaceLabels(person),
    // Connections are drawn on the tree being viewed, between people it
    // shows, so who may remove them is decided there.
    getViewer(profile, type.key, tree.id),
  ]);
  const isHomeRoot = homeRole === "admin";

  if (!canEdit && !canFill) redirect(suggestChangeHref(personId));

  const values = personFormValues({ ...person, last_name: person.last_name });
  const displayName = personDisplayName({
    ...person,
    last_name: person.last_name,
  });

  if (canFill) {
    const blanks = blankFields({
      first_name: person.first_name,
      middle_name: person.middle_name,
      preferred_name: person.preferred_name,
      maiden_name: person.maiden_name,
      sex: person.sex,
      date_of_birth: person.date_of_birth,
      birth_month: person.birth_month,
      place_id_birth: person.place_id_birth,
      city_of_birth: person.city_of_birth,
      country_of_birth: person.country_of_birth,
      is_deceased: person.is_deceased ?? false,
      date_of_death: person.date_of_death,
      place_id_death: person.place_id_death,
      place_of_death: person.place_of_death,
      photo_path: person.photo_path,
    });
    return (
      <PageColumn>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Fill in {displayName}
            </h1>
            {/* The form shows only what's empty, so it needs no line saying
                so (Step 58); with nothing empty, there's no form at all. */}
            {blanks.length > 0 ? null : (
              <p className="text-sm text-muted-foreground">
                Nothing left to fill in.
              </p>
            )}
          </div>
          <Button
            nativeButton={false}
            render={<Link href={treeFocusHref(personId)} />}
            size="sm"
            variant="outline"
          >
            Back to tree
          </Button>
        </div>

        {blanks.length > 0 ? (
          <PersonFillForm
            treeId={tree.id}
            personId={personId}
            values={values}
            blanks={blanks}
          />
        ) : null}
      </PageColumn>
    );
  }


  // This person's lines on the tree being viewed, from its shared read.
  const { edges } = await loadTreeEdges(tree.id);
  const rels = edges.filter(
    (r) => r.from_person === personId || r.to_person === personId,
  );
  const members = allMembers.filter((m) => m.id !== personId);
  const nameById = new Map(allMembers.map((m) => [m.id, m.label]));
  const connections: ExistingConnection[] = rels.flatMap((r) => {
    if (!r.id || !r.from_person || !r.to_person || !r.type || !r.created_by)
      return [];
    const otherId = r.from_person === personId ? r.to_person : r.from_person;
    const otherName = nameById.get(otherId);
    if (!otherName) return [];
    // parent edges are stored from = parent, to = child; spouse / sibling
    // edges are undirected.
    const kind: ConnectionKind =
      r.type === "spouse" || r.type === "sibling"
        ? (r.type as "spouse" | "sibling")
        : r.from_person === personId
          ? "parent"
          : "child";
    return [
      {
        id: r.id,
        otherName,
        kind,
        canRemove: canEditConnection(
          {
            from_person: r.from_person,
            to_person: r.to_person,
            created_by: r.created_by,
          },
          treeViewer,
        ),
        // A spouse line's dates go with it; its Remove says so first. A
        // day and month without a year counts (Step 63).
        hasMarriageDate: Boolean(r.marriage_date || r.marriage_month),
        hasDivorceDate: Boolean(r.divorce_date),
      },
    ];
  });

  return (
    <PageColumn>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit {displayName}
        </h1>
        {/* Said only when the entry's home is another tree (Step 58). */}
        {person.is_home ? null : (
          <p className="text-sm text-muted-foreground">
            This entry’s home is {homeTree?.name ?? "another tree"}; changes
            show there and on every tree it appears on.
          </p>
        )}
      </div>

      {/* Back to tree floats with Save changes, in reach all the way down
          (Step 59), and opens the canvas on this person again (Step 61). */}
      <PersonForm
        backHref={treeFocusHref(personId)}
        treeId={tree.id}
        isAdmin={isHomeRoot}
        person={{
          ...values,
          id: personId,
          photo_path: person.photo_path,
          photo_crop: person.photo_crop,
        }}
        photoUrl={photoUrl}
        placeLabels={placeLabels}
        withContact={person.owner_user_id === profile.auth_user_id}
        self={personId === profile.self_person_id}
      />

      <EditConnections
        treeId={tree.id}
        personId={personId}
        personName={displayName}
        personPartners={
          allMembers.find((m) => m.id === personId)?.partners ?? []
        }
        members={members}
        connections={connections}
      />
    </PageColumn>
  );
}
