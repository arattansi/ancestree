import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { NOBODY } from "@/lib/tree";

type DbClient = SupabaseClient<Database>;

/** A companion animal plus everything the canvas chip and its panel need. */
export type TreePet = {
  id: string;
  name: string;
  species: string;
  species_label: string | null;
  year_born: number | null;
  birth_date: string | null;
  place_id_birth: number | null;
  city_of_birth: string | null;
  country_of_birth: string | null;
  year_died: number | null;
  is_deceased: boolean;
  photo_path: string | null;
  photo_crop: unknown;
  pos_dx: number | null;
  pos_dy: number | null;
  created_by: string;
  /**
   * The companion the chip hangs from on the canvas. Always one of
   * `companions`; null only on a pet whose primary was deleted, which the
   * layout covers by standing in the topmost companion.
   */
  primary_person_id: string | null;
  photo_url: string | null;
  /** The people this pet belongs to. Always at least one (see the DB trigger). */
  companions: string[];
};

const PET_COLUMNS =
  "id, name, species, species_label, year_born, birth_date, place_id_birth, city_of_birth, country_of_birth, year_died, is_deceased, photo_path, photo_crop, pos_dx, pos_dy, created_by, primary_person_id";

/**
 * Every companion in the tree with its people and a signed photo URL. Read
 * separately from `getTreeGraph` on purpose: pets are not part of the family
 * graph and nothing in the layout, bloodline, or claim code should see them.
 * `forPublic` is the share link's read (Step 61): no user ids or storage
 * paths, as with `getTreeGraph`.
 */
export async function getTreePets(
  treeId: string,
  db?: DbClient,
  { forPublic = false }: { forPublic?: boolean } = {},
): Promise<TreePet[]> {
  const supabase = db ?? (await createClient());

  // Each pet with its people, in one read (Step 77.1), first linked first.
  const { data } = await supabase
    .from("pets")
    .select(`${PET_COLUMNS}, pet_companions(person_id)`)
    .eq("tree_id", treeId)
    .order("created_at", { ascending: true })
    .order("created_at", { referencedTable: "pet_companions", ascending: true });

  if (!data || data.length === 0) return [];

  const paths = data
    .map((r) => r.photo_path)
    .filter((p): p is string => Boolean(p));
  const urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("photos")
      .createSignedUrls(paths, 60 * 60);
    for (const item of signed ?? []) {
      if (item.signedUrl && item.path) urlByPath.set(item.path, item.signedUrl);
    }
  }

  return data.map(({ pet_companions: links, ...row }) => ({
    ...row,
    photo_url: row.photo_path ? (urlByPath.get(row.photo_path) ?? null) : null,
    companions: (links ?? []).map((link) => link.person_id),
    ...(forPublic ? { created_by: NOBODY, photo_path: null } : {}),
  }));
}
