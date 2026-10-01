import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccountTypeKey } from "@/lib/account-types";
import { carryApprovalOf, type CarryApproval } from "@/lib/carry";
import { accountTypesByPerson } from "@/lib/account-type-links";
import { joinedByPerson, type JoinedBy } from "@/lib/joined-by";
import type { Database } from "@/lib/database.types";
import {
  photoUrlsOf,
  signedCardPhotoUrls,
  signedPhotoUrls,
} from "@/lib/entry-view.server";
import { createClient } from "@/lib/supabase/server";

/** Either the cookie-scoped SSR client or the service-role admin client. */
type DbClient = SupabaseClient<Database>;
import { personDisplayName } from "@/lib/person-name";
import {
  formatHistoricalPlace,
  resolveHistoricalName,
  type HistoricalNameRow,
} from "@/lib/historical-names";
import { countryName, isCountryPlace } from "@/lib/country-names";
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
  /** A date that's a rough estimate, shown "c. 1950" (Step 81). */
  date_of_birth_circa: boolean;
  date_of_death_circa: boolean;
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
  /**
   * A placeholder child's number (Step 98.2), shown as "First Child"…: no
   * name or details of its own, its parent's alone to fill in. `null` on
   * every other entry.
   */
  placeholder_number: number | null;
  /** True when the tree being drawn is the entry's home. */
  is_home: boolean;
  /** Drawn blurred to visitors from other trees (Step 25.4). */
  hidden_from_visitors: boolean;
  /**
   * The viewer is a visitor and this person is hidden from them: only the
   * card's place is known, nothing about who it is (Step 25.4).
   */
  blurred: boolean;
  /**
   * Brought over from another tree and still waiting for a yes, or refused
   * one (Step 80): this tree shows the name and the place of birth, and
   * nothing else is read here at all. Every other field is empty.
   */
  basic: boolean;
  /** Where that yes stands; `none` when there was nothing to ask. */
  approval: PlacementApproval;
  /** Whose yes a basic card waits on: the member whose entry it is, or
   *  whoever may edit it on its home tree. */
  asked_of: AskedOf;
  /** The full-size photo: the sheet, its photo dialog, the cropper and a
   *  card's hover preview. */
  photo_url: string | null;
  /** The same photo sized for a card's avatar (Step 87.5): every small
   *  face on the canvas. Full size when storage wouldn't sign a small one. */
  photo_card_url: string | null;
  /** Open reports on this entry the viewer may see (Step 88.2): only
   *  whoever can put it right, and whoever raised one. */
  open_report_count: number;
  /** `approved` once someone has claimed this entry, otherwise `null`. A
   *  dispute of the claim is a report now, and leaves the claim standing
   *  (Step 88.2). */
  claim_status: "approved" | null;
  /** The active claim row id, when `claim_status` is set. */
  claim_id: string | null;
  /** The account type of the member this entry belongs to (Step 19.1), or
   *  `null` for an entry no member has. Only loaded for signed-in members
   *  (`getTreeGraph`'s `withAccountTypes`); always `null` on a share link. */
  account_type: AccountTypeKey | null;
  /** Who added this entry and who invited its person to this tree (Step
   *  86), loaded with `account_type`; `null` when nobody is to be named. */
  joined_by: JoinedBy | null;
};

export type PlacementApproval = CarryApproval;

type AskedOf = "owner" | "stewards" | null;

const approvalOf = carryApprovalOf;

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
  /**
   * Drawn on the tree being read, rather than brought along with the
   * people it joins. A line to a basic card is this tree's to change only
   * when it is (Step 80, `private.can_edit_relationship`).
   */
  drawn_here: boolean;
};

/**
 * What the canvas reads per placed person (Step 25): the person's details plus
 * the card position *on this tree*, from the `tree_people` view. `is_home`
 * says whether this tree is the one whose rules govern the entry.
 */
const PERSON_COLUMNS =
  "id, home_tree_id, is_home, first_name, middle_name, preferred_name, maiden_name, last_name, date_of_birth, date_of_death, date_of_birth_precision, date_of_death_precision, birth_month, birth_day, date_of_birth_circa, date_of_death_circa, city_of_birth, country_of_birth, place_id_birth, place_id_death, is_deceased, place_of_death, sex, lineage_type, photo_path, photo_crop, pos_x, pos_y, owner_user_id, created_by, pos_dx, pos_dy, hidden_from_visitors, blurred, email, email_visible, detail, approval, asked_of, nudge_due, placeholder_number";

/**
 * Stands in for the user ids on a public read (`forPublic`): the nil UUID,
 * which no viewer has, not even a share link's signed-out one (`""`), so it
 * never makes an entry look like the viewer's own.
 */
export const NOBODY = "00000000-0000-0000-0000-000000000000";

const EDGE_COLUMNS =
  "id, from_person, to_person, type, created_by, marriage_date, marriage_month, marriage_day, is_divorced, divorce_date, drawn_on_tree_id";

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

/** How many rows PostgREST answers with at most (the project's `max_rows`). */
const PAGE = 1000;

/**
 * A read that may run past one answer, asked for page by page until a page
 * comes back short. `read` must order its rows, or pages can overlap.
 */
export async function readPaged<T>(
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ rows: T[]; failed: boolean }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) return { rows, failed: true };
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return { rows, failed: false };
  }
}

/**
 * Everyone placed on any of `treeIds`, once per tree they're on, each row
 * saying which tree it is (My Family Tree, Step 92): one read for all of
 * them, not one per tree.
 */
export async function readTreesPeople(
  supabase: DbClient,
  treeIds: readonly string[],
) {
  return readPaged((from, to) =>
    supabase
      .from("tree_people")
      .select(`tree_id, ${PERSON_COLUMNS}` as `tree_id, ${typeof PERSON_COLUMNS}`)
      .in("tree_id", treeIds)
      .order("tree_id")
      .order("id")
      .range(from, to),
  );
}

/** The lines each of `treeIds` draws, each row saying which tree. */
export async function readTreesEdges(
  supabase: DbClient,
  treeIds: readonly string[],
) {
  return readPaged((from, to) =>
    supabase
      .from("tree_edges")
      .select(`tree_id, ${EDGE_COLUMNS}` as `tree_id, ${typeof EDGE_COLUMNS}`)
      .in("tree_id", treeIds)
      .order("tree_id")
      .order("id")
      .range(from, to),
  );
}

/**
 * A `tree_people` row as a card on `treeId`, or `null` when it isn't one.
 * The view's columns are nullable to TypeScript (a view has no NOT NULL);
 * every row has an id, a family name and a home, or it isn't a person —
 * unless it is a hidden person seen by a visitor, whose card is drawn from
 * the placement alone (Step 25.4), or a basic card (Step 80), whose row
 * carries a name and a place of birth and says nothing of who made it. A
 * placeholder child (Step 98.2) has no family name: its number stands in.
 */
export function cardOf(p: TreePersonRow, treeId: string) {
  if (!p.id) return null;
  const named = !!p.last_name || p.placeholder_number != null;
  if (p.detail === "basic" && !p.blurred && named && p.home_tree_id) {
    return {
      ...p,
      id: p.id,
      last_name: p.last_name ?? "",
      home_tree_id: p.home_tree_id,
      is_home: false,
      owner_user_id: "",
      created_by: "",
      country_of_birth: p.country_of_birth ?? "",
      is_deceased: false,
      date_of_birth_precision: "day",
      date_of_death_precision: "day",
      date_of_birth_circa: false,
      date_of_death_circa: false,
      hidden_from_visitors: false,
      blurred: false,
      basic: true,
      approval: approvalOf(p.approval),
      asked_of: (p.asked_of === "owner" ? "owner" : "stewards") as AskedOf,
    };
  }
  if (
    p.blurred ||
    !named ||
    !p.home_tree_id ||
    !p.owner_user_id ||
    !p.created_by
  ) {
    if (!p.blurred) return null;
    return {
      ...p,
      id: p.id,
      first_name: null,
      middle_name: null,
      preferred_name: null,
      maiden_name: null,
      last_name: "Hidden",
      placeholder_number: null,
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
      date_of_birth_circa: false,
      date_of_death_circa: false,
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
      basic: false,
      approval: approvalOf(null),
      asked_of: null as AskedOf,
    };
  }
  return {
    ...p,
    id: p.id,
    last_name: p.last_name ?? "",
    home_tree_id: p.home_tree_id,
    is_home: p.is_home ?? p.home_tree_id === treeId,
    owner_user_id: p.owner_user_id,
    created_by: p.created_by,
    country_of_birth: p.country_of_birth ?? "",
    is_deceased: p.is_deceased ?? false,
    date_of_birth_precision: p.date_of_birth_precision ?? "day",
    date_of_death_precision: p.date_of_death_precision ?? "day",
    date_of_birth_circa: p.date_of_birth_circa ?? false,
    date_of_death_circa: p.date_of_death_circa ?? false,
    hidden_from_visitors: p.hidden_from_visitors ?? false,
    blurred: false,
    basic: false,
    approval: approvalOf(p.approval),
    asked_of: null as AskedOf,
  };
}

/** A card before its photo, places, claim and reports are filled in. */
export type TreeCard = NonNullable<ReturnType<typeof cardOf>>;

type TreeEdgeRow = Awaited<ReturnType<typeof readTreeEdges>>["edges"][number];

/** A `tree_edges` row as a line on `treeId`, or `null` when it isn't one. */
export function lineOf(
  r: TreeEdgeRow,
  treeId: string,
  forPublic = false,
): TreeGraphEdge | null {
  if (!r.id || !r.from_person || !r.to_person || !r.type || !r.created_by) {
    return null;
  }
  return {
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
    drawn_here: r.drawn_on_tree_id === treeId,
  };
}

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
    .select(
      "auth_user_id, display_name, role, self_person_id, joined_at, invited_by_user_id, invited_by_name",
    )
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
 * The claims on the tree's own people, once per request: the cards'
 * badges, whose entry is whose, and what a Branch edits around. Only this
 * tree's people, not every claim in the database (Step 77.1, audit S7).
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
      .eq("status", "approved")
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
 * (Step 61): no claims (a claimed entry is a member's) and no reports, and
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
  const [peopleRows, { edges: edgeRows }, histRows, directory] =
    await Promise.all([
      shared ? loadTreePeople(treeId) : readTreePeople(supabase, treeId),
      shared ? loadTreeEdges(treeId) : readTreeEdges(supabase, treeId),
      readHistoricalNames(supabase),
      withAccountTypes && !forPublic
        ? shared
          ? loadTreeDirectory(treeId)
          : readDirectory(supabase, treeId)
        : null,
    ]);

  const rows = peopleRows.flatMap((p) => cardOf(p, treeId) ?? []);
  const edges = edgeRows.flatMap((r) => lineOf(r, treeId, forPublic) ?? []);
  const people = await finishCards(supabase, rows, {
    histRows,
    claims: forPublic
      ? []
      : shared
        ? loadTreeClaims(treeId)
        : readApprovedClaims(
            supabase,
            rows.map((p) => p.id),
          ),
    directories: directory ? new Map([[treeId, directory]]) : null,
    treeOf: () => treeId,
    forPublic,
  });
  return { people, relationships: edges };
}

/** Every curated period name for a place (Step 4.5d). */
export async function readHistoricalNames(
  supabase: DbClient,
): Promise<HistoricalNameRow[]> {
  const { data } = await supabase
    .from("historical_names")
    .select("place_id, country_code, name, start_date, end_date");
  return (data ?? []) as HistoricalNameRow[];
}

type ClaimRow = { id: string; person_id: string; claimant_user_id: string };

/** The settled claims on `ids`. */
export function readApprovedClaims(
  supabase: DbClient,
  ids: readonly string[],
): Promise<ClaimRow[]> {
  return readIn(ids, (chunk) =>
    supabase
      .from("claims")
      .select("id, person_id, status, claimant_user_id")
      .eq("status", "approved")
      .in("person_id", chunk),
  );
}

export type DirectoryRow = Awaited<ReturnType<typeof readDirectory>>[number];

/**
 * Cards as the canvas draws them: each with its photo's addresses, its
 * places' period names, its claim, the reports the viewer may see, and, when
 * `directories` are read, whose entry it is and who brought it. One wave of
 * reads for every card, whichever trees they came from.
 *
 * `treeOf` names the tree a card is read on: its directory says whose entry
 * it is there (an account type is per tree), and who added it.
 */
export async function finishCards(
  supabase: DbClient,
  rows: readonly TreeCard[],
  {
    histRows,
    claims: claimsRead,
    directories,
    treeOf,
    forPublic = false,
  }: {
    histRows: readonly HistoricalNameRow[];
    claims: readonly ClaimRow[] | Promise<readonly ClaimRow[]>;
    directories: ReadonlyMap<string, readonly DirectoryRow[]> | null;
    treeOf: (personId: string) => string;
    forPublic?: boolean;
  },
): Promise<TreeGraphPerson[]> {
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
  // Whoever added an entry but isn't on its tree's directory (they left, or
  // it was added on another tree) is named from their profile (Step 86).
  const listed = new Map(
    [...(directories ?? [])].map(([treeId, directory]) => [
      treeId,
      new Set(directory.map((m) => m.auth_user_id)),
    ]),
  );
  const unlisted = directories
    ? [
        ...new Set(
          rows.flatMap((p) =>
            p.created_by && !listed.get(treeOf(p.id))?.has(p.created_by)
              ? [p.created_by]
              : [],
          ),
        ),
      ]
    : [];
  // Card-sized photos sign one by one (Step 87.5), alongside the rest.
  const cardUrls = signedCardPhotoUrls(supabase, rows);
  const [placeRes, claims, reports, urlByPath, unlistedProfiles] =
    await Promise.all([
      placeIds.length > 0
        ? supabase
            .from("places")
            .select("id, name, country_code, feature_code")
            .in("id", placeIds)
        : Promise.resolve({
            data: [] as {
              id: number;
              name: string;
              country_code: string | null;
              feature_code: string | null;
            }[],
          }),
      claimsRead,
      // Those who may see a report (RLS) are those who can put it right, and
      // whoever raised it (Step 88.2): the count follows the same rule.
      forPublic
        ? []
        : readIn(ids, (chunk) =>
            supabase
              .from("entry_reports")
              .select("person_id")
              .eq("status", "open")
              .in("person_id", chunk),
          ),
      signedPhotoUrls(supabase, paths),
      readIn(unlisted, (chunk) =>
        supabase
          .from("profiles")
          .select("auth_user_id, display_name")
          .in("auth_user_id", chunk),
      ),
    ]);
  const cardUrlOf = await cardUrls;
  const otherNames = new Map(
    unlistedProfiles.flatMap((p) =>
      p.display_name ? [[p.auth_user_id, p.display_name] as const] : [],
    ),
  );
  // Whose entry is whose, by account type *on the card's tree* (see
  // `accountTypesByPerson`): from that tree's own directory, so a member's
  // type there is the one shown, not their type somewhere else.
  const accountTypes = new Map<string, Map<string, AccountTypeKey>>();
  const joinedBy = new Map<string, Map<string, JoinedBy>>();
  for (const [treeId, directory] of directories ?? []) {
    const members = directory.flatMap((m) =>
      m.auth_user_id ? [{ ...m, auth_user_id: m.auth_user_id }] : [],
    );
    accountTypes.set(
      treeId,
      accountTypesByPerson(
        members.map((m) => ({
          auth_user_id: m.auth_user_id,
          role: m.role,
          self_person_id: m.self_person_id,
        })),
        claims,
      ),
    );
    joinedBy.set(
      treeId,
      joinedByPerson(
        rows.filter((p) => treeOf(p.id) === treeId),
        members,
        claims,
        otherNames,
      ),
    );
  }
  const placeById = new Map((placeRes.data ?? []).map((p) => [p.id, p]));

  const historicalFor = (
    placeId: number | null,
    town: string | null,
    fallbackCountry: string | null,
    eventDate: string | null,
  ): string | null => {
    const place = placeId != null ? placeById.get(placeId) : undefined;
    const cc = place?.country_code ?? null;
    const historical = resolveHistoricalName(histRows, {
      placeId,
      countryCode: cc,
      eventDate,
    });
    if (!historical) return null;
    return formatHistoricalPlace({
      // A whole country has no town to name before it (Step 79).
      city: place && isCountryPlace(place) ? null : town,
      modernCountry: (cc ? countryName(cc) : null) || fallbackCountry,
      historical,
    });
  };

  // person_id -> its claim.
  const claimByPerson = new Map(claims.map((c) => [c.person_id, c.id]));
  const openReportsByPerson = new Map<string, number>();
  for (const r of reports) {
    openReportsByPerson.set(
      r.person_id,
      (openReportsByPerson.get(r.person_id) ?? 0) + 1,
    );
  }
  return rows.map((p) => {
    const claimId = claimByPerson.get(p.id) ?? null;
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
      ...photoUrlsOf(p, urlByPath, cardUrlOf),
      claim_status: claimId ? "approved" : null,
      claim_id: claimId,
      open_report_count: openReportsByPerson.get(p.id) ?? 0,
      account_type: accountTypes.get(treeOf(p.id))?.get(p.id) ?? null,
      joined_by: joinedBy.get(treeOf(p.id))?.get(p.id) ?? null,
      birth_place_historical: historicalFor(
        p.place_id_birth,
        p.city_of_birth,
        p.country_of_birth,
        p.date_of_birth,
      ),
      death_place_historical: historicalFor(
        p.place_id_death,
        // The town's own name: place_of_death holds the whole label
        // ("Nairobi, Kenya"), which read "Nairobi, Kenya, Kenya Colony".
        (p.place_id_death != null
          ? placeById.get(p.place_id_death)?.name
          : null) ?? p.place_of_death,
        null,
        p.date_of_death,
      ),
    };
  });
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
