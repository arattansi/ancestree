import "server-only";

import type { Profile } from "@/lib/auth";
import { placeLabels, signedPhotoUrl } from "@/lib/entry-view.server";
import {
  heldBackRows,
  type HeldBackDetails,
  type HeldBackRow,
} from "@/lib/held-back";
import { personDisplayName } from "@/lib/person-name";
import { personFormValues, type PersonFormValues } from "@/lib/person-schema";
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
      "id, tree_id, first_name, middle_name, preferred_name, maiden_name, last_name, date_of_birth, date_of_birth_precision, birth_month, birth_day, date_of_birth_circa, place_id_birth, city_of_birth, country_of_birth, is_deceased, date_of_death, date_of_death_precision, date_of_death_circa, place_id_death, place_of_death, sex, lineage_type, photo_path, photo_crop, email, email_visible",
    )
    .eq("id", profile.self_person_id)
    .maybeSingle();
  if (!person?.id || !person.last_name) return null;

  // The photo, the places and their role at home, side by side (Step 77.1).
  const [photoUrl, labels, homeRole] = await Promise.all([
    signedPhotoUrl(supabase, person.photo_path),
    placeLabels(person),
    getRoleIn(person.tree_id),
  ]);
  const entry = { ...person, last_name: person.last_name };

  return {
    homeTreeId: person.tree_id,
    displayName: personDisplayName(entry),
    isHomeRoot: homeRole === "admin",
    person: {
      id: person.id,
      photo_path: person.photo_path,
      photo_crop: person.photo_crop,
      ...personFormValues(entry),
    },
    photoUrl,
    placeLabels: labels,
  };
}

/**
 * The member's own entry when it's a placeholder child (Step 98.3): a child
 * who claimed it by an invite, whose details stay hidden from the family
 * until their parent shows them. `null` for anyone else.
 */
export async function ownPlaceholderId(profile: Profile): Promise<string | null> {
  if (!profile.self_person_id) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("people")
    .select("id, placeholder_number")
    .eq("id", profile.self_person_id)
    .maybeSingle();
  return data?.placeholder_number != null ? data.id : null;
}

/**
 * What's held back of the member's own placeholder (Step 98.3), as the
 * account page lists it; empty when nothing is.
 */
export async function ownHeldBack(personId: string): Promise<HeldBackRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("withheld_details", { p_person: personId });
  return heldBackRows(data as HeldBackDetails | null);
}
