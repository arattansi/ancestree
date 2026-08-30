import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PersonForm } from "@/components/person-form";
import { Button } from "@/components/ui/button";
import { getUser, requireSelfPerson } from "@/lib/auth";
import { personDisplayName } from "@/lib/person-name";
import type { PersonFormValues } from "@/lib/person-schema";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit entry" };

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireSelfPerson();
  const user = await getUser();
  if (!user) redirect("/join");

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select(
      "id, tree_id, given_name, preferred_name, maiden_name, family_name, date_of_birth, city_of_birth, country_of_birth, is_deceased, date_of_death, place_of_death, lineage_type, photo_path, owner_user_id, created_by",
    )
    .eq("id", id)
    .maybeSingle();

  if (!person) notFound();

  const { data: approvedClaim } = await supabase
    .from("claims")
    .select("id")
    .eq("person_id", id)
    .eq("status", "approved")
    .maybeSingle();

  const isAdmin = profile.role === "admin";
  const canEdit =
    isAdmin ||
    person.owner_user_id === user.id ||
    (person.created_by === user.id &&
      person.owner_user_id === person.created_by &&
      !approvedClaim);

  if (!canEdit) redirect("/tree");

  let photoUrl: string | null = null;
  if (person.photo_path) {
    const { data: signed } = await supabase.storage
      .from("photos")
      .createSignedUrl(person.photo_path, 60 * 60);
    photoUrl = signed?.signedUrl ?? null;
  }

  const values: PersonFormValues = {
    given_name: person.given_name ?? "",
    preferred_name: person.preferred_name ?? "",
    maiden_name: person.maiden_name ?? "",
    family_name: person.family_name,
    date_of_birth: person.date_of_birth ?? "",
    city_of_birth: person.city_of_birth ?? "",
    country_of_birth: person.country_of_birth,
    is_deceased: person.is_deceased,
    date_of_death: person.date_of_death ?? "",
    place_of_death: person.place_of_death ?? "",
    lineage_type:
      (person.lineage_type as PersonFormValues["lineage_type"]) ?? undefined,
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Edit {personDisplayName(person)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Changes are visible to everyone on the tree.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link href="/tree" />}
          size="sm"
          variant="outline"
        >
          Back to tree
        </Button>
      </div>

      <PersonForm
        treeId={person.tree_id}
        isAdmin={isAdmin}
        person={{ ...values, id: person.id, photo_path: person.photo_path }}
        photoUrl={photoUrl}
      />
    </main>
  );
}
