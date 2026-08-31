import "server-only";

import { createClient } from "@/lib/supabase/server";
import { personDisplayName } from "@/lib/person-name";
import {
  formatHistoricalPlace,
  resolveHistoricalName,
  type HistoricalNameRow,
} from "@/lib/historical-names";
import { countryName } from "@/lib/country-names";
import type { TreeMemberOption } from "@/components/relationship-picker";

/** A person plus the fields the tree canvas + detail panel need. */
export type TreeGraphPerson = {
  id: string;
  first_name: string | null;
  middle_name: string | null;
  preferred_name: string | null;
  maiden_name: string | null;
  last_name: string;
  date_of_birth: string | null;
  date_of_death: string | null;
  city_of_birth: string | null;
  country_of_birth: string;
  place_id_birth: number | null;
  place_id_death: number | null;
  is_deceased: boolean;
  place_of_death: string | null;
  sex: string | null;
  /** "City, Period name · now Country" when a curated period name applies to the
   *  birth/death year (Step 4.5d); otherwise null and the plain text is shown. */
  birth_place_historical: string | null;
  death_place_historical: string | null;
  lineage_type: string | null;
  photo_path: string | null;
  pos_x: number | null;
  pos_y: number | null;
  pos_dx: number | null;
  pos_dy: number | null;
  owner_user_id: string;
  created_by: string;
  verified_at: string | null;
  photo_url: string | null;
  /** Count of open (unresolved) flags raised against this entry. */
  open_flag_count: number;
  /** `approved` once someone has claimed this entry, `disputed` while an admin
   *  is reviewing a contested claim, otherwise `null`. */
  claim_status: "approved" | "disputed" | null;
  /** The active claim row id, when `claim_status` is set. */
  claim_id: string | null;
};

export type TreeGraphEdge = {
  id: string;
  from_person: string;
  to_person: string;
  type: string;
  created_by: string;
  /** Spouse edges only (Step 11.5). */
  marriage_date: string | null;
  is_divorced: boolean;
  divorce_date: string | null;
};

const PERSON_COLUMNS =
  "id, first_name, middle_name, preferred_name, maiden_name, last_name, date_of_birth, date_of_death, city_of_birth, country_of_birth, place_id_birth, place_id_death, is_deceased, place_of_death, sex, lineage_type, photo_path, pos_x, pos_y, owner_user_id, created_by, verified_at, pos_dx, pos_dy";

/** Everyone in the tree plus their relationship edges, with signed photo URLs. */
export async function getTreeGraph(treeId: string): Promise<{
  people: TreeGraphPerson[];
  relationships: TreeGraphEdge[];
}> {
  const supabase = await createClient();
  const [peopleRes, relRes, claimRes, flagRes] = await Promise.all([
    supabase.from("people").select(PERSON_COLUMNS).eq("tree_id", treeId),
    supabase
      .from("relationships")
      .select(
        "id, from_person, to_person, type, created_by, marriage_date, is_divorced, divorce_date",
      )
      .eq("tree_id", treeId),
    supabase
      .from("claims")
      .select("id, person_id, status")
      .in("status", ["approved", "disputed"]),
    supabase
      .from("entry_comments")
      .select("person_id")
      .eq("is_flag", true)
      .eq("status", "open"),
  ]);

  const openFlagsByPerson = new Map<string, number>();
  for (const f of flagRes.data ?? []) {
    openFlagsByPerson.set(
      f.person_id,
      (openFlagsByPerson.get(f.person_id) ?? 0) + 1,
    );
  }

  const rows = peopleRes.data ?? [];

  // Step 4.5d — resolve period-appropriate place names for birth/death years.
  const placeIds = [
    ...new Set(
      rows
        .flatMap((p) => [p.place_id_birth, p.place_id_death])
        .filter((n): n is number => typeof n === "number"),
    ),
  ];
  const [placeRes, histRes] = await Promise.all([
    placeIds.length > 0
      ? supabase.from("places").select("id, country_code").in("id", placeIds)
      : Promise.resolve({ data: [] as { id: number; country_code: string | null }[] }),
    supabase
      .from("historical_names")
      .select("place_id, country_code, name, start_date, end_date"),
  ]);
  const ccByPlace = new Map(
    (placeRes.data ?? []).map((p) => [p.id, p.country_code]),
  );
  const histRows = (histRes.data ?? []) as HistoricalNameRow[];

  const historicalFor = (
    placeId: number | null,
    fallbackCity: string | null,
    fallbackCountry: string | null,
    eventDate: string | null,
  ): string | null => {
    const cc = placeId != null ? ccByPlace.get(placeId) ?? null : null;
    const historical = resolveHistoricalName(histRows, {
      placeId,
      countryCode: cc,
      eventDate,
    });
    if (!historical) return null;
    return formatHistoricalPlace({
      city: fallbackCity,
      modernCountry: (cc ? countryName(cc) : null) || fallbackCountry,
      historical,
    });
  };

  // person_id -> active claim. `disputed` wins over `approved` if both exist.
  const claimByPerson = new Map<
    string,
    { id: string; status: "approved" | "disputed" }
  >();
  for (const c of claimRes.data ?? []) {
    const status = c.status as "approved" | "disputed";
    const current = claimByPerson.get(c.person_id);
    if (!current || (current.status === "approved" && status === "disputed")) {
      claimByPerson.set(c.person_id, { id: c.id, status });
    }
  }
  const paths = rows
    .map((p) => p.photo_path)
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

  return {
    people: rows.map((p) => {
      const claim = claimByPerson.get(p.id) ?? null;
      return {
        ...p,
        photo_url: p.photo_path ? urlByPath.get(p.photo_path) ?? null : null,
        claim_status: claim?.status ?? null,
        claim_id: claim?.id ?? null,
        open_flag_count: openFlagsByPerson.get(p.id) ?? 0,
        birth_place_historical: historicalFor(
          p.place_id_birth,
          p.city_of_birth,
          p.country_of_birth,
          p.date_of_birth,
        ),
        death_place_historical: historicalFor(
          p.place_id_death,
          p.place_of_death,
          null,
          p.date_of_death,
        ),
      };
    }),
    relationships: relRes.data ?? [],
  };
}

/** The single shared v1 tree, or `null` if an admin hasn't bootstrapped yet. */
export async function getSharedTree(): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("trees")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/**
 * The people the canvas is centred on: the founding admins' own entries. The
 * layout anchors generation 0 on them and grows the tree outward, so the chart
 * stays stable as relatives are added at either end.
 */
export async function getTreeAnchors(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("self_person_id, created_at")
    .eq("role", "admin")
    .not("self_person_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(2);
  return (data ?? [])
    .map((row) => row.self_person_id)
    .filter((id): id is string => id !== null);
}

/**
 * Everyone currently in the tree, as search-select options, newest last.
 * `excludeId` drops a person (e.g. the caller's own entry) from the list.
 */
export async function listTreeMembers(
  treeId: string,
  excludeId?: string | null,
): Promise<TreeMemberOption[]> {
  const supabase = await createClient();
  const [{ data }, { data: parentRels }] = await Promise.all([
    supabase
      .from("people")
      .select("id, first_name, preferred_name, maiden_name, last_name")
      .eq("tree_id", treeId)
      .order("last_name", { ascending: true }),
    supabase
      .from("relationships")
      .select("from_person, to_person")
      .eq("tree_id", treeId)
      .eq("type", "parent"),
  ]);

  const labelById = new Map(
    (data ?? []).map((p) => [p.id, personDisplayName(p)]),
  );
  // child id -> [{ parent id, label }]
  const parentsByChild = new Map<string, { id: string; label: string }[]>();
  for (const r of parentRels ?? []) {
    const label = labelById.get(r.from_person);
    if (!label) continue;
    const list = parentsByChild.get(r.to_person) ?? [];
    list.push({ id: r.from_person, label });
    parentsByChild.set(r.to_person, list);
  }

  return (data ?? [])
    .filter((p) => p.id !== excludeId)
    .map((p) => ({
      id: p.id,
      label: personDisplayName(p),
      maidenName: p.maiden_name ?? null,
      parents: parentsByChild.get(p.id) ?? [],
    }));
}
