import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PersonForm } from "@/components/person-form";
import {
  EditConnections,
  type ConnectionKind,
  type ExistingConnection,
} from "@/components/tree/edit-connections";
import { Button } from "@/components/ui/button";
import { canEditConnection, canEditEntry } from "@/lib/branch";
import { getSpokenForEntryIds, getViewer } from "@/lib/branch.server";
import { toPartialIso } from "@/lib/partial-date";
import { personDisplayName } from "@/lib/person-name";
import { formatPlaceLabel, getPlacesByIds } from "@/lib/places";
import type { PersonFormValues } from "@/lib/person-schema";
import { createClient } from "@/lib/supabase/server";
import { listTreeMembers } from "@/lib/tree";
import {
  getRoleIn,
  getTreeById,
  requireTreeSelfPerson,
} from "@/lib/tree-context";
import { treeFocusHref, treeHref } from "@/lib/tree-links";

export const metadata: Metadata = { title: "edit entry" };

export default async function EditPersonPage({
  params,
}: PageProps<"/people/[id]/edit">) {
  const { id } = await params;
  const { tree, profile, type } = await requireTreeSelfPerson();

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("tree_people")
    .select(
      "id, home_tree_id, is_home, first_name, middle_name, preferred_name, maiden_name, last_name, date_of_birth, date_of_birth_precision, place_id_birth, city_of_birth, country_of_birth, is_deceased, date_of_death, date_of_death_precision, place_id_death, place_of_death, ancestral_lands_birth, ancestral_lands_death, sex, lineage_type, photo_path, photo_crop, owner_user_id, created_by, email, email_visible",
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
  const homeTreeId = person.home_tree_id;

  const { data: approvedClaim } = await supabase
    .from("claims")
    .select("id")
    .eq("person_id", personId)
    .eq("status", "approved")
    .maybeSingle();

  // Details follow the HOME tree's rules (Step 25): who the viewer is there
  // decides, even when they opened the entry from another tree. Someone who
  // isn't a member there may edit only their own entry.
  const homeRole = await getRoleIn(homeTreeId);
  const homeTree = person.is_home ? tree : await getTreeById(homeTreeId);
  const isHomeRoot = homeRole === "admin";
  const [viewer, spokenFor] = await Promise.all([
    homeRole ? getViewer(profile, homeRole, homeTreeId) : null,
    getSpokenForEntryIds(profile.auth_user_id),
  ]);
  const canEdit = viewer
    ? canEditEntry(
        {
          id: personId,
          owner_user_id: person.owner_user_id,
          created_by: person.created_by,
          isClaimed: !!approvedClaim,
          isSomeoneElsesOwn: spokenFor.has(personId),
        },
        viewer,
      )
    : personId === profile.self_person_id;

  if (!canEdit) redirect(treeFocusHref(personId));

  let photoUrl: string | null = null;
  if (person.photo_path) {
    const { data: signed } = await supabase.storage
      .from("photos")
      .createSignedUrl(person.photo_path, 60 * 60);
    photoUrl = signed?.signedUrl ?? null;
  }

  const placeMap = await getPlacesByIds(
    [person.place_id_birth, person.place_id_death].filter(
      (n): n is number => typeof n === "number",
    ),
  );
  const birthPlace = person.place_id_birth
    ? placeMap.get(person.place_id_birth)
    : undefined;
  const deathPlace = person.place_id_death
    ? placeMap.get(person.place_id_death)
    : undefined;
  const placeLabels = {
    birth: birthPlace ? formatPlaceLabel(birthPlace) : person.city_of_birth,
    death: deathPlace ? formatPlaceLabel(deathPlace) : person.place_of_death,
  };

  // Connections are drawn on the tree being viewed, between people it shows.
  const treeViewer = await getViewer(profile, type.key, tree.id);
  const [allMembers, { data: rels }] = await Promise.all([
    listTreeMembers(tree.id),
    supabase
      .from("tree_edges")
      .select("id, from_person, to_person, type, created_by")
      .eq("tree_id", tree.id)
      .or(`from_person.eq.${personId},to_person.eq.${personId}`),
  ]);
  const members = allMembers.filter((m) => m.id !== personId);
  const nameById = new Map(allMembers.map((m) => [m.id, m.label]));
  const connections: ExistingConnection[] = (rels ?? []).flatMap((r) => {
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
      },
    ];
  });

  const values: PersonFormValues = {
    first_name: person.first_name ?? "",
    middle_name: person.middle_name ?? "",
    preferred_name: person.preferred_name ?? "",
    maiden_name: person.maiden_name ?? "",
    last_name: person.last_name,
    // A partial date opens as just what's known ("1931", "1931-03").
    date_of_birth: toPartialIso(
      person.date_of_birth,
      person.date_of_birth_precision ?? "day",
    ),
    place_id_birth: person.place_id_birth ?? null,
    city_of_birth: person.city_of_birth ?? "",
    country_of_birth: person.country_of_birth ?? "",
    ancestral_lands_birth: person.ancestral_lands_birth ?? "",
    is_deceased: person.is_deceased ?? false,
    date_of_death: toPartialIso(
      person.date_of_death,
      person.date_of_death_precision ?? "day",
    ),
    place_id_death: person.place_id_death ?? null,
    place_of_death: person.place_of_death ?? "",
    ancestral_lands_death: person.ancestral_lands_death ?? "",
    sex: (person.sex as PersonFormValues["sex"]) ?? undefined,
    lineage_type:
      (person.lineage_type as PersonFormValues["lineage_type"]) ?? undefined,
    email: person.email ?? "",
    email_visible: person.email_visible ?? false,
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Edit {personDisplayName({ ...person, last_name: person.last_name })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {person.is_home
              ? "Changes are visible on every tree this entry appears on."
              : `This entry’s home is ${homeTree?.name ?? "another tree"}; changes show there and on every tree it appears on.`}
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link href={treeHref()} />}
          size="sm"
          variant="outline"
        >
          Back to tree
        </Button>
      </div>

      <PersonForm
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
      />

      <EditConnections
        treeId={tree.id}
        personId={personId}
        personName={personDisplayName({
          ...person,
          last_name: person.last_name,
        })}
        personPartners={
          allMembers.find((m) => m.id === personId)?.partners ?? []
        }
        members={members}
        connections={connections}
      />
    </main>
  );
}
