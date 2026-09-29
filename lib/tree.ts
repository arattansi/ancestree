import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccountTypeKey } from "@/lib/account-types";
import { accountTypesByPerson } from "@/lib/account-type-links";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

/** Either the cookie-scoped SSR client or the service-role admin client. */
type DbClient = SupabaseClient<Database>;
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
  /** How much of each date is known — `day` | `month` | `year` (Step 17). A
   *  partial date sits on the first day of its period; show it with
   *  `formatPartialDate`, never as the raw ISO string. */
  date_of_birth_precision: string;
  date_of_death_precision: string;
  /** A birthday kept without its year (Step 63): set only while
   *  `date_of_birth` is empty, as `date_of_birth` always has a year. */
  birth_month: number | null;
  birth_day: number | null;
  city_of_birth: string | null;
  country_of_birth: string;
  place_id_birth: number | null;
  place_id_death: number | null;
  is_deceased: boolean;
  place_of_death: string | null;
  sex: string | null;
  /**
   * The person's email, when they show it to other members or the viewer
   * owns the entry — the `tree_people` view withholds it otherwise.
   */
  email: string | null;
  email_visible: boolean;
  /** "City, Period name · now Country" when a curated period name applies to the
   *  birth/death year (Step 4.5d); otherwise null and the plain text is shown. */
  birth_place_historical: string | null;
  death_place_historical: string | null;
  lineage_type: string | null;
  photo_path: string | null;
  /** Thumbnail framing for `photo_path`; null means the centred default. */
  photo_crop: unknown;
  pos_x: number | null;
  pos_y: number | null;
  pos_dx: number | null;
  pos_dy: number | null;
  owner_user_id: string;
  created_by: string;
  /** The tree whose rules govern this entry (Step 25). */
  home_tree_id: string;
  /** True when the tree being drawn is the entry's home. */
  is_home: boolean;
  /** Drawn blurred to visitors from other trees (Step 25.4). */
  hidden_from_visitors: boolean;
  /**
   * The viewer is a visitor and this person is hidden from them: only the
   * card's place is known, nothing about who it is (Step 25.4).
   */
  blurred: boolean;
  photo_url: string | null;
  /** Count of open (unresolved) flags raised against this entry. */
  open_flag_count: number;
  /** `approved` once someone has claimed this entry, `disputed` while an admin
   *  is reviewing a contested claim, otherwise `null`. */
  claim_status: "approved" | "disputed" | null;
  /** The active claim row id, when `claim_status` is set. */
  claim_id: string | null;
  /** The account type of the member this entry belongs to (Step 19.1), or
   *  `null` for an entry no member has. Only loaded for signed-in members
   *  (`getTreeGraph`'s `withAccountTypes`); always `null` on a share link. */
  account_type: AccountTypeKey | null;
};

export type TreeGraphEdge = {
  id: string;
  from_person: string;
  to_person: string;
  type: string;
  created_by: string;
  /** Spouse edges only (Step 11.5). */
  marriage_date: string | null;
  /** A wedding day kept without its year, set only with no `marriage_date`
   *  (Step 63). */
  marriage_month: number | null;
  marriage_day: number | null;
  is_divorced: boolean;
  divorce_date: string | null;
};

/**
 * What the canvas reads per placed person (Step 25): the person's details plus
 * the card position *on this tree*, from the `tree_people` view. `is_home`
 * says whether this tree is the one whose rules govern the entry.
 */
const PERSON_COLUMNS =
  "id, home_tree_id, is_home, first_name, middle_name, preferred_name, maiden_name, last_name, date_of_birth, date_of_death, date_of_birth_precision, date_of_death_precision, birth_month, birth_day, city_of_birth, country_of_birth, place_id_birth, place_id_death, is_deceased, place_of_death, sex, lineage_type, photo_path, photo_crop, pos_x, pos_y, owner_user_id, created_by, pos_dx, pos_dy, hidden_from_visitors, blurred, email, email_visible";

/**
 * Stands in for the user ids on a public read (`forPublic`): the nil UUID,
 * which no viewer has, not even a share link's signed-out one (`""`), so it
 * never makes an entry look like the viewer's own.
 */
export const NOBODY = "00000000-0000-0000-0000-000000000000";

const EDGE_COLUMNS =
  "id, from_person, to_person, type, created_by, marriage_date, marriage_month, marriage_day, is_divorced, divorce_date";

/** Everyone placed on the tree, as the `tree_people` view holds them. */
async function readTreePeople(supabase: DbClient, treeId: string) {
  const { data } = await supabase
    .from("tree_people")
    .select(PERSON_COLUMNS)
    .eq("tree_id", treeId);
  return data ?? [];
}

/**
 * The lines between the tree's people, as the `tree_edges` view holds them.
 * `failed` says the read went wrong, for the few callers that would rather
 * know nothing than reason over half a tree.
 */
async function readTreeEdges(supabase: DbClient, treeId: string) {
  const { data, error } = await supabase
    .from("tree_edges")
    .select(EDGE_COLUMNS)
    .eq("tree_id", treeId);
  return { edges: data ?? [], failed: !!error };
}

export type TreePersonRow = Awaited<ReturnType<typeof readTreePeople>>[number];

/**
 * Everyone placed on the tree as the signed-in member may see them, read
 * once per request whoever asks: the canvas, the connection audit and the
 * header's count of it (Step 77.1, audit S7). A share link's service-role
 * read never comes through here.
 */
export const loadTreePeople = cache(
  async (treeId: string): Promise<TreePersonRow[]> =>
    readTreePeople(await createClient(), treeId),
);

/**
 * The lines between the tree's people, read once per request whoever asks:
 * the canvas, the connection audit, the Branch and Leaf walks, the bloodline,
 * the member pickers (Step 77.1, audit S7).
 */
export const loadTreeEdges = cache(async (treeId: string) =>
  readTreeEdges(await createClient(), treeId),
);

/** The ids of everyone placed on a tree, hidden ones included. */
export function placedIds(people: readonly { id: string | null }[]): string[] {
  return people.flatMap((p) => (p.id ? [p.id] : []));
}

/**
 * Who is on a tree now (its active placements), ids only: the light read,
 * for pages that don't draw the tree. Once per request.
 */
const loadPlacedIds = cache(async (treeId: string): Promise<Set<string>> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tree_placements")
    .select("person_id")
    .eq("tree_id", treeId)
    .eq("status", "active");
  return new Set((data ?? []).map((p) => p.person_id));
});

async function readDirectory(supabase: DbClient, treeId: string) {
  const { data } = await supabase
    .from("member_directory")
    .select("auth_user_id, role, self_person_id, joined_at")
    .eq("tree_id", treeId)
    .order("joined_at", { ascending: true });
  return data ?? [];
}

/**
 * The tree's members as its directory lists them, first to join first:
 * whose entry is whose, and which entries are the Roots'. Once per request.
 */
export const loadTreeDirectory = cache(
  async (treeId: string) => readDirectory(await createClient(), treeId),
);

/** How many ids go in one `in` filter, so a big tree's request stays short. */
const IN_CHUNK = 150;

/** A select filtered to `ids`, in chunks read side by side. */
export async function readIn<T>(
  ids: readonly string[],
  read: (chunk: string[]) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    chunks.push(ids.slice(i, i + IN_CHUNK));
  }
  const results = await Promise.all(chunks.map((chunk) => read(chunk)));
  return results.flatMap((r) => r.data ?? []);
}

/**
 * The claims settled (`approved`) or contested (`disputed`) on the tree's
 * own people, once per request: the cards' badges, whose entry is whose,
 * and what a Branch edits around. Only this tree's people, not every claim
 * in the database (Step 77.1, audit S7).
 */
export const loadTreeClaims = cache(async (treeId: string) => {
  const [people, supabase] = await Promise.all([
    loadTreePeople(treeId),
    createClient(),
  ]);
  return readIn(placedIds(people), (chunk) =>
    supabase
      .from("claims")
      .select("id, person_id, status, claimant_user_id")
      .in("status", ["approved", "disputed"])
      .in("person_id", chunk),
  );
});

/**
 * Everyone placed on the tree plus the connections between them, with signed
 * photo URLs. Both come from the tree views, so a person shown on two trees is
 * read once per canvas, positioned for that canvas.
 *
 * `withAccountTypes` is opt-in and set only by the member canvas (Step 19.1):
 * a share link passes the RLS-bypassing admin client, and a visitor there must
 * never learn who on the tree has an account, let alone what kind. Left off,
 * the member directory isn't even read. `forPublic` is the share link's read
 * (Step 61): no claims (a claimed entry is a member's) and no open flags, and
 * no user ids, email addresses or storage paths in what reaches the browser.
 */
export async function getTreeGraph(
  treeId: string,
  db?: DbClient,
  {
    withAccountTypes = false,
    forPublic = false,
  }: { withAccountTypes?: boolean; forPublic?: boolean } = {},
): Promise<{
  people: TreeGraphPerson[];
  relationships: TreeGraphEdge[];
}> {
  const supabase = db ?? (await createClient());
  // The signed-in member's reads are shared across the request (Step 77.1);
  // a share link's service-role reads never are.
  const shared = !db;
  // Everything that needs only the tree, in one wave; then what needs its
  // people, in a second.
  const [peopleRows, { edges: edgeRows }, flagRes, histRes, directory] = await Promise.all([
    shared ? loadTreePeople(treeId) : readTreePeople(supabase, treeId),
    shared ? loadTreeEdges(treeId) : readTreeEdges(supabase, treeId),
    forPublic
      ? { data: null }
      : supabase
          .from("entry_comments")
          .select("person_id")
          .eq("tree_id", treeId)
          .eq("is_flag", true)
          .eq("status", "open"),
    supabase
      .from("historical_names")
      .select("place_id, country_code, name, start_date, end_date"),
    withAccountTypes && !forPublic
      ? shared
        ? loadTreeDirectory(treeId)
        : readDirectory(supabase, treeId)
      : null,
  ]);

  const openFlagsByPerson = new Map<string, number>();
  for (const f of flagRes.data ?? []) {
    openFlagsByPerson.set(
      f.person_id,
      (openFlagsByPerson.get(f.person_id) ?? 0) + 1,
    );
  }

  // The view's columns are nullable to TypeScript (a view has no NOT NULL);
  // every row has an id, a family name and a home, or it isn't a person —
  // unless it is a hidden person seen by a visitor, whose card is drawn from
  // the placement alone (Step 25.4).
  const rows = peopleRows.flatMap((p) => {
    if (!p.id) return [];
    if (
      p.blurred ||
      !p.last_name ||
      !p.home_tree_id ||
      !p.owner_user_id ||
      !p.created_by
    ) {
      if (!p.blurred) return [];
      return [
        {
          ...p,
          id: p.id,
          first_name: null,
          middle_name: null,
          preferred_name: null,
          maiden_name: null,
          last_name: "Hidden",
          home_tree_id: treeId,
          is_home: false,
          owner_user_id: "",
          created_by: "",
          country_of_birth: "",
          is_deceased: false,
          date_of_birth: null,
          date_of_death: null,
          date_of_birth_precision: "day",
          date_of_death_precision: "day",
          birth_month: null,
          birth_day: null,
          city_of_birth: null,
          place_id_birth: null,
          place_id_death: null,
          place_of_death: null,
          sex: null,
          lineage_type: null,
          photo_path: null,
          photo_crop: null,
          hidden_from_visitors: true,
          blurred: true,
        },
      ];
    }
    return [
      {
        ...p,
        id: p.id,
        last_name: p.last_name,
        home_tree_id: p.home_tree_id,
        is_home: p.is_home ?? p.home_tree_id === treeId,
        owner_user_id: p.owner_user_id,
        created_by: p.created_by,
        country_of_birth: p.country_of_birth ?? "",
        is_deceased: p.is_deceased ?? false,
        date_of_birth_precision: p.date_of_birth_precision ?? "day",
        date_of_death_precision: p.date_of_death_precision ?? "day",
        hidden_from_visitors: p.hidden_from_visitors ?? false,
        blurred: false,
      },
    ];
  });
  const edges: TreeGraphEdge[] = edgeRows.flatMap((r) =>
    r.id && r.from_person && r.to_person && r.type && r.created_by
      ? [
          {
            id: r.id,
            from_person: r.from_person,
            to_person: r.to_person,
            type: r.type,
            created_by: forPublic ? NOBODY : r.created_by,
            marriage_date: r.marriage_date,
            marriage_month: r.marriage_month,
            marriage_day: r.marriage_day,
            is_divorced: r.is_divorced ?? false,
            divorce_date: r.divorce_date,
          },
        ]
      : [],
  );

  // Step 4.5d — resolve period-appropriate place names for birth/death years.
  const placeIds = [
    ...new Set(
      rows
        .flatMap((p) => [p.place_id_birth, p.place_id_death])
        .filter((n): n is number => typeof n === "number"),
    ),
  ];
  const paths = rows
    .map((p) => p.photo_path)
    .filter((p): p is string => Boolean(p));
  const ids = rows.map((p) => p.id);
  const [placeRes, claims, signedRes] = await Promise.all([
    placeIds.length > 0
      ? supabase.from("places").select("id, country_code").in("id", placeIds)
      : Promise.resolve({
          data: [] as { id: number; country_code: string | null }[],
        }),
    forPublic
      ? []
      : shared
        ? loadTreeClaims(treeId)
        : readIn(ids, (chunk) =>
            supabase
              .from("claims")
              .select("id, person_id, status, claimant_user_id")
              .in("status", ["approved", "disputed"])
              .in("person_id", chunk),
          ),
    paths.length > 0
      ? supabase.storage.from("photos").createSignedUrls(paths, 60 * 60)
      : { data: null },
  ]);
  // Whose entry is whose, by account type *on this tree* (see
  // `accountTypesByPerson`): from this tree's own directory, so a member's
  // type here is the one shown, not their type somewhere else.
  const accountTypes = directory
    ? accountTypesByPerson(
        directory.flatMap((m) =>
          m.auth_user_id
            ? [
                {
                  auth_user_id: m.auth_user_id,
                  role: m.role,
                  self_person_id: m.self_person_id,
                },
              ]
            : [],
        ),
        claims.filter((c) => c.status === "approved"),
      )
    : null;
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
    const cc = placeId != null ? (ccByPlace.get(placeId) ?? null) : null;
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
  for (const c of claims) {
    const status = c.status as "approved" | "disputed";
    const current = claimByPerson.get(c.person_id);
    if (!current || (current.status === "approved" && status === "disputed")) {
      claimByPerson.set(c.person_id, { id: c.id, status });
    }
  }
  const urlByPath = new Map<string, string>();
  for (const item of signedRes.data ?? []) {
    if (item.signedUrl && item.path) urlByPath.set(item.path, item.signedUrl);
  }

  return {
    people: rows.map((p) => {
      const claim = claimByPerson.get(p.id) ?? null;
      return {
        ...p,
        ...(forPublic
          ? {
              owner_user_id: NOBODY,
              created_by: NOBODY,
              email: null,
              photo_path: null,
            }
          : {}),
        // Null on a blurred row (the view's left join); no email, not shown.
        email_visible: p.email_visible ?? false,
        photo_url: p.photo_path ? (urlByPath.get(p.photo_path) ?? null) : null,
        claim_status: claim?.status ?? null,
        claim_id: claim?.id ?? null,
        open_flag_count: openFlagsByPerson.get(p.id) ?? 0,
        account_type: accountTypes?.get(p.id) ?? null,
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
    relationships: edges,
  };
}

/**
 * The people a tree's canvas is centred on: its bloodline anchors — the
 * founding Roots' own entries, in the order they were set. The layout anchors
 * generation 0 on them and grows the tree outward, so the chart stays stable
 * as relatives are added at either end.
 */
export async function getTreeAnchors(
  treeId: string,
  db?: DbClient,
): Promise<string[]> {
  const supabase = db ?? (await createClient());
  // The Roots' entries are wanted only when there are no anchors, but for a
  // member they're read with what the canvas reads anyway, so they're asked
  // for at once rather than after (Step 77.1).
  const [{ data }, rootIds] = await Promise.all([
    supabase
      .from("bloodline_anchors")
      .select("person_id, created_at")
      .eq("tree_id", treeId)
      .order("created_at", { ascending: true })
      .limit(2),
    db ? null : getRootEntryIds(treeId),
  ]);
  const anchors = (data ?? []).map((row) => row.person_id);
  if (anchors.length > 0) return anchors;
  // A tree whose Roots haven't anchored it yet centres on their entries.
  return (rootIds ?? (await getRootEntryIds(treeId, supabase))).slice(0, 2);
}

/**
 * Every Root's own entry on this tree: what a Branch's side of the tree is
 * measured from (Step 18.1). Unlike `getTreeAnchors` this is every Root, not
 * the first two the canvas is centred on. Mirrors `private.root_person_ids`.
 */
export async function getRootEntryIds(
  treeId: string,
  db?: DbClient,
): Promise<string[]> {
  if (!db) {
    // Both reads are shared with the rest of the request, and asked for
    // together (Step 77.1).
    const [directory, shown] = await Promise.all([
      loadTreeDirectory(treeId),
      loadPlacedIds(treeId),
    ]);
    return rootEntries(directory).filter((id) => shown.has(id));
  }
  const ids = rootEntries(await readDirectory(db, treeId));
  if (ids.length === 0) return [];
  // Only entries this tree shows: a Root whose own entry sits elsewhere
  // measures no side here.
  const { data: placed } = await db
    .from("tree_placements")
    .select("person_id")
    .eq("tree_id", treeId)
    .eq("status", "active")
    .in("person_id", ids);
  const shown = new Set((placed ?? []).map((p) => p.person_id));
  return ids.filter((id) => shown.has(id));
}

/** The Roots' own entries in a tree's directory, first to join first. */
function rootEntries(
  directory: readonly { role: string | null; self_person_id: string | null }[],
): string[] {
  return directory.flatMap((m) =>
    m.role === "admin" && m.self_person_id ? [m.self_person_id] : [],
  );
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
  // The lines come from the tree's shared read (Step 77.1); the people are
  // read here, in the order the picker lists them.
  const [peopleRes, { edges }] = await Promise.all([
    supabase
      .from("tree_people")
      .select("id, first_name, preferred_name, maiden_name, last_name")
      .eq("tree_id", treeId)
      .order("last_name", { ascending: true }),
    loadTreeEdges(treeId),
  ]);
  const parentRes = { data: edges.filter((e) => e.type === "parent") };
  const spouseRes = { data: edges.filter((e) => e.type === "spouse") };
  const data = (peopleRes.data ?? []).flatMap((p) =>
    p.id && p.last_name ? [{ ...p, id: p.id, last_name: p.last_name }] : [],
  );
  const parentRels = (parentRes.data ?? []).flatMap((r) =>
    r.from_person && r.to_person
      ? [{ from_person: r.from_person, to_person: r.to_person }]
      : [],
  );
  const spouseRels = (spouseRes.data ?? []).flatMap((r) =>
    r.from_person && r.to_person
      ? [
          {
            from_person: r.from_person,
            to_person: r.to_person,
            is_divorced: r.is_divorced ?? false,
          },
        ]
      : [],
  );

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

  // person id -> their partners. Offered as a second parent when someone is
  // connected as this person's child, so a child added to one partner doesn't
  // silently end up with only half its parentage.
  const partnersOf = new Map<
    string,
    { id: string; label: string; isDivorced: boolean }[]
  >();
  const addPartner = (person: string, partner: string, isDivorced: boolean) => {
    const label = labelById.get(partner);
    if (!label) return;
    const list = partnersOf.get(person) ?? [];
    list.push({ id: partner, label, isDivorced });
    partnersOf.set(person, list);
  };
  for (const r of spouseRels ?? []) {
    addPartner(r.from_person, r.to_person, r.is_divorced);
    addPartner(r.to_person, r.from_person, r.is_divorced);
  }

  return (data ?? [])
    .filter((p) => p.id !== excludeId)
    .map((p) => ({
      id: p.id,
      label: personDisplayName(p),
      maidenName: p.maiden_name ?? null,
      parents: parentsByChild.get(p.id) ?? [],
      partners: partnersOf.get(p.id) ?? [],
    }));
}
