import "server-only";

import type { Profile } from "@/lib/auth";
import { toPartialIso } from "@/lib/partial-date";
import { personDisplayName } from "@/lib/person-name";
import type { PersonFormValues } from "@/lib/person-schema";
import { formatPlaceLabel, getPlacesByIds } from "@/lib/places";
import { createClient } from "@/lib/supabase/server";
import { getRoleIn } from "@/lib/tree-context";

export type OwnEntry = {
  /** The entry's home tree: where its photo lives and whose rules apply. */
  homeTreeId: string;
  displayName: string;
  /** True when they're a Root of the home tree, which unlocks lineage. */
  isHomeRoot: boolean;
  person: PersonFormValues & {
    id: string;
    photo_path: string | null;
    photo_crop: unknown;
  };
  photoUrl: string | null;
  placeLabels: { birth: string | null; death: string | null };
};

/**
 * The member's own entry, ready for the edit form on their account page —
 * the same details their card shows on every tree. `null` when they have
 * no entry yet.
 */
export async function loadOwnEntry(profile: Profile): Promise<OwnEntry | null> {
  if (!profile.self_person_id) return null;
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select(
      "id, tree_id, first_name, middle_name, preferred_name, maiden_name, last_name, date_of_birth, date_of_birth_precision, place_id_birth, city_of_birth, country_of_birth, is_deceased, date_of_death, date_of_death_precision, place_id_death, place_of_death, ancestral_lands_birth, ancestral_lands_death, sex, lineage_type, photo_path, photo_crop, email, email_visible",
    )
    .eq("id", profile.self_person_id)
    .maybeSingle();
  if (!person?.id || !person.last_name) return null;

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

  return {
    homeTreeId: person.tree_id,
    displayName: personDisplayName({ ...person, last_name: person.last_name }),
    isHomeRoot: (await getRoleIn(person.tree_id)) === "admin",
    person: {
      id: person.id,
      photo_path: person.photo_path,
      photo_crop: person.photo_crop,
      first_name: person.first_name ?? "",
      middle_name: person.middle_name ?? "",
      preferred_name: person.preferred_name ?? "",
      maiden_name: person.maiden_name ?? "",
      last_name: person.last_name,
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
    },
    photoUrl,
    placeLabels: {
      birth: birthPlace
        ? formatPlaceLabel(birthPlace)
        : (person.city_of_birth ?? null),
      death: deathPlace
        ? formatPlaceLabel(deathPlace)
        : (person.place_of_death ?? null),
    },
  };
}
