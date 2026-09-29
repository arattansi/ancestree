"use server";

import { OWN_LINE_REFUSAL, isOwnLineRefusal } from "@/lib/account-types";
import { requireProfile, type Profile } from "@/lib/auth";
import { bloodTieRefusal, readBloodTieRefusal } from "@/lib/bloodline";
import { mintClaimInvite } from "@/lib/claim-invite-send.server";
import {
  friendlyDbError,
  ownedWrite,
  RLS_REFUSED,
  type ErrorRule,
} from "@/lib/db-errors";
import { toStoredCrop, type CropTransform } from "@/lib/image-crop";
import { photoPathOwner } from "@/lib/photo-path";
import {
  normalizeSpouseDates,
  type StoredSpouseDates,
} from "@/lib/spouse-dates";
import {
  personSchema,
  toPersonPayload,
  type PersonFormValues,
} from "@/lib/person-schema";
import {
  refToString,
  type AddPeopleInput,
  type RelationshipKind,
} from "@/lib/connections";
import { detectImpliedConnections } from "@/lib/connection-suggestions.server";
import { fillFields } from "@/lib/fill-blanks";
import type {
  ImpliedConnection,
  NewPersonInput,
  SuggestedType,
  SuggestionSource,
} from "@/lib/connection-suggestions";
import { revalidateTreePages } from "@/lib/revalidate";
import { getRoleIn, rootOf } from "@/lib/tree-context";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/database.types";

export type PersonActionState = {
  personId?: string;
  error?: string;
};

/**
 * A photo that goes with an edit (Step 77.5): a new file, already uploaded
 * to the entry's folder, and its framing; or the photo it has, framed anew.
 * Saved in the same write as the details, so an edit is one change — one
 * notice to the entry's people, one undo for a Root.
 */
export type PhotoChange = { path: string; crop: CropTransform } | { crop: CropTransform };

/**
 * What a refused write to someone else's entry says. RLS doesn't raise on an
 * UPDATE it filters out — the row simply isn't touched — so the actions below
 * ask for the row back and treat "none" as this.
 */
const NOT_YOURS_TO_EDIT =
  "Only this entry's owner, a Branch for this side of the family, or a Root can change it.";
const NOT_YOURS_TO_MOVE =
  "Only this entry's owner, a Branch for this side of the family, or a Root can move this card.";

const NO_PERMISSION = "You don't have permission to make that change.";

/** What a refused write to an entry says, by the database's reason. */
const ENTRY_RULES: readonly ErrorRule[] = [
  [isOwnLineRefusal, OWN_LINE_REFUSAL],
  ["already exists", "Your own entry already exists."],
  [RLS_REFUSED, NO_PERMISSION],
];

function friendlyError(message: string | undefined): string {
  return friendlyDbError(
    message,
    ENTRY_RULES,
    "Couldn't save this entry. Check the fields and try again.",
  );
}

/** A marriage's dates in the wrong order, however the write was made. */
const DIVORCE_AFTER_MARRIAGE: ErrorRule = [
  "divorce_after_marriage",
  "The divorce date can't be before the marriage date.",
];

/** What a refused connection says, by the database's reason. */
const CONNECTION_RULES: readonly ErrorRule[] = [
  [isOwnLineRefusal, OWN_LINE_REFUSAL],
  [
    "already in the tree",
    "These entries don't connect to the tree yet — pick someone already on it, or add the people in between.",
  ],
  ["parent/child loop", "That connection would create a parent/child loop."],
  ["your own entry already exists", "Your own entry already exists."],
  [
    "not in this tree",
    "The person you're connecting to is no longer on the tree. Refresh and try again.",
  ],
  [
    "partners and parent and child",
    "Two people can't be both partners and parent and child.",
  ],
  [RLS_REFUSED, NO_PERMISSION],
];

function friendlyConnectionError(message: string | undefined): string {
  return friendlyDbError(
    message,
    CONNECTION_RULES,
    "Couldn't save these entries. Check the fields and try again.",
  );
}

/**
 * A new marriage line's dates, as `add_people_with_connections` reads its
 * edges: an empty string for a date it hasn't got.
 */
function spouseEdgeDates(e: {
  marriage_date?: string | null;
  marriage_month?: number | null;
  marriage_day?: number | null;
  is_divorced?: boolean;
  divorce_date?: string | null;
}) {
  const d = normalizeSpouseDates(e);
  return {
    marriage_date: d.marriage_date ?? "",
    marriage_month: d.marriage_month,
    marriage_day: d.marriage_day,
    is_divorced: d.is_divorced,
    divorce_date: d.divorce_date ?? "",
  };
}

export type AddPeopleResult = {
  personIds?: string[];
  selfId?: string | null;
  error?: string;
};

/**
 * Create one or more people plus the parent/spouse edges that connect them,
 * in a single transaction. Used by first-run onboarding (`selfIndex` set) and
 * by "add a relative" (`selfIndex` null). Non-admin entries must connect to an
 * existing tree member, and everyone's to someone born into the family (Step
 * 55, `lib/bloodline.ts`); the DB RPC enforces both and guards against cycles.
 * Draws no page: `addRelative` does, once it's done.
 */
async function addPeople(
  profile: Profile,
  input: AddPeopleInput,
): Promise<AddPeopleResult> {

  if (input.selfIndex !== null && profile.self_person_id) {
    return { error: "Your own entry already exists." };
  }
  if (!Array.isArray(input.people) || input.people.length === 0) {
    return { error: "Add at least one person." };
  }

  const people: PersonFormValues[] = [];
  for (const raw of input.people) {
    const parsed = personSchema.safeParse(raw);
    if (!parsed.success) {
      return { error: "Please fix the highlighted fields and try again." };
    }
    people.push(parsed.data);
  }

  if (!input.treeId) return { error: "Pick a tree to add to." };
  const isAdmin = (await getRoleIn(input.treeId)) === "admin";
  const pPeople = people.map((values) => {
    const p = toPersonPayload(values);
    return {
      first_name: p.first_name ?? "",
      middle_name: p.middle_name ?? "",
      preferred_name: p.preferred_name ?? "",
      maiden_name: p.maiden_name ?? "",
      last_name: p.last_name,
      country_of_birth: p.country_of_birth,
      city_of_birth: p.city_of_birth ?? "",
      date_of_birth: p.date_of_birth ?? "",
      date_of_birth_precision: p.date_of_birth_precision,
      birth_month: p.birth_month,
      birth_day: p.birth_day,
      is_deceased: p.is_deceased,
      date_of_death: p.date_of_death ?? "",
      date_of_death_precision: p.date_of_death_precision,
      place_of_death: p.place_of_death ?? "",
      // lineage_type is admin-only; the DB nulls it for other writers anyway.
      lineage_type: isAdmin ? p.lineage_type : null,
    };
  });

  const pEdges = input.edges.map((e) => ({
    type: e.type,
    a: refToString(e.a),
    b: refToString(e.b),
    ...(e.type === "spouse" ? spouseEdgeDates(e) : {}),
  }));

  const pSuggestions = (input.suggestions ?? []).map((s) => ({
    subject: refToString(s.subject),
    related: refToString(s.related),
    suggested_type: s.suggested_type,
    source: s.source,
    resolution: s.resolution,
  }));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_people_with_connections", {
    p_people: pPeople,
    p_edges: pEdges,
    p_self_index: input.selfIndex ?? undefined,
    p_suggestions: pSuggestions,
    p_tree: input.treeId,
  });

  if (error || !data) {
    // No blood tie (Step 55): say who, so they know whom to connect.
    const refusal = readBloodTieRefusal(error);
    return {
      error: refusal
        ? bloodTieRefusal(refusal, input.selfIndex)
        : friendlyConnectionError(error?.message),
    };
  }

  const result = data as { ids: string[]; self_id: string | null };

  // The RPC still takes only the legacy text place columns; set the canonical
  // `places` FKs (Step 4.5c) on the freshly-created rows, and a date that's
  // a rough estimate (Step 81). ids align with people.
  const placeUpdates = result.ids
    .map((personId, i) => {
      const values = people[i];
      if (!values) return null;
      const p = toPersonPayload(values);
      const update = {
        place_id_birth: p.place_id_birth,
        place_id_death: p.place_id_death,
        sex: p.sex,
        ...(p.date_of_birth_circa ? { date_of_birth_circa: true } : {}),
        ...(p.date_of_death_circa ? { date_of_death_circa: true } : {}),
      };
      if (Object.values(update).every((v) => v == null)) return null;
      return supabase.from("people").update(update).eq("id", personId);
    })
    .filter((q): q is NonNullable<typeof q> => q !== null);
  if (placeUpdates.length > 0) await Promise.all(placeUpdates);

  return { personIds: result.ids, selfId: result.self_id };
}

export type AddRelativeResult = AddPeopleResult & {
  /** Connections the tree implies, to answer before anything is saved. */
  askable?: ImpliedConnection[];
  /** Where the invite to claim the new entry went. */
  invited?: string;
  /** Saved, but the invite didn't go: why. */
  inviteWarning?: string;
};

/**
 * Add a relative, or yourself, in one call (Step 77.5): look for the
 * connections the tree implies (`detect`, on the first try — answered, they
 * come back as `suggestions`), save the people and their lines, and send
 * the invite to claim the new entry that was asked for with it. It used to
 * be up to four calls, each drawing the page again.
 *
 * Only the entries can fail it. Once they exist, an invite that doesn't go
 * is a warning: a failure would bring the button back, and a second press
 * would add everyone again. A photo can't come in the same call — storage
 * lets it into the entry's folder only once the entry exists — so with
 * `photoFollows` the page is drawn again by the photo's own save instead,
 * once.
 */
export async function addRelative(
  input: AddPeopleInput & {
    detect?: { newPeople: NewPersonInput[] };
    inviteEmail?: string | null;
    photoFollows?: boolean;
  },
): Promise<AddRelativeResult> {
  const profile = await requireProfile();

  if (input.detect) {
    let askable: ImpliedConnection[] = [];
    try {
      askable = await detectImpliedConnections(input.treeId, {
        newPeople: input.detect.newPeople,
        pendingEdges: input.edges,
      });
    } catch {
      // Detection is advisory — never block an add on its failure.
    }
    if (askable.length > 0) return { askable };
  }

  const added = await addPeople(profile, input);
  if (added.error || !added.personIds) return added;

  const primaryId = added.personIds[0];
  let invited: string | undefined;
  let inviteWarning: string | undefined;
  if (input.inviteEmail && primaryId) {
    try {
      const res = await mintClaimInvite(profile, primaryId, input.inviteEmail);
      if (res.error) inviteWarning = res.error;
      else invited = res.email;
    } catch {
      inviteWarning = "Couldn't reach the email service.";
    }
  }

  if (!input.photoFollows) revalidateTreePages();
  return { ...added, invited, inviteWarning };
}

/**
 * Update the optional marriage / divorce fields on a spouse relationship.
 * Gated by the `relationships_update` RLS (admin, the edge's `created_by`, or a
 * branch admin with both ends on their branch); the DB CHECKs keep the dates
 * coherent. All fields optional; a wedding day without its year is its month
 * and day, with no date (Step 63).
 */
export async function updateRelationshipMarriage(
  relationshipId: string,
  input: {
    marriage_date?: string | null;
    marriage_month?: number | null;
    marriage_day?: number | null;
    is_divorced: boolean;
    divorce_date?: string | null;
  },
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const dates = normalizeSpouseDates(input);
  const notYours =
    "Only the relationship's creator, a Branch for this side of the family, or a Root can edit this.";
  const saved = await ownedWrite(
    supabase
      .from("relationships")
      .update(dates)
      .eq("id", relationshipId)
      .eq("type", "spouse")
      .select("id"),
    {
      refused: notYours,
      failed: (m) =>
        friendlyDbError(
          m,
          [DIVORCE_AFTER_MARRIAGE, [RLS_REFUSED, notYours]],
          "Couldn't save those dates. Try again.",
        ),
    },
  );
  if (saved.error) return { error: saved.error };
  revalidateTreePages();
  return {};
}

/**
 * Resolve a still-pending implied connection later, from a person's detail
 * panel. Author or admin only (enforced by RLS + the RPC).
 */
export async function resolveConnectionSuggestion(
  id: string,
  resolution: "accepted" | "dismissed" | "pending",
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_connection_suggestion", {
    p_id: id,
    p_resolution: resolution,
  });
  if (error) return { error: friendlyConnectionError(error.message) };
  revalidateTreePages();
  return {};
}

/**
 * Answer a candidate the engine derived. A derived candidate has no row of its
 * own, so it is identified by its shape — subject, related, type, source — the
 * same unique key the ledger stores. Accepting a `spouse` / `parent` also
 * creates the edge; a `duplicate_check` only records the answer, because the
 * app has no merge to run.
 */
export async function resolveImpliedConnection(input: {
  subjectPersonId: string;
  relatedPersonId: string;
  suggestedType: SuggestedType;
  /**
   * Every rule that proposed this edge. A merged prompt carries more than one,
   * and all of them are recorded, so answering once settles it for good.
   */
  sources: SuggestionSource[];
  resolution: "accepted" | "dismissed";
}): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  for (const source of input.sources) {
    const { error } = await supabase.rpc("resolve_implied_connection", {
      p_subject: input.subjectPersonId,
      p_related: input.relatedPersonId,
      p_type: input.suggestedType,
      p_source: source,
      p_resolution: input.resolution,
    });
    if (error) return { error: friendlyConnectionError(error.message) };
  }
  revalidateTreePages();
  return {};
}

/**
 * Link two people who are *both* already in the tree — used by the "Add a
 * connection" card on the edit page. `kind` reads "the person being edited is
 * the {kind} of {otherId}". Membership, the partner/parent guard and the cycle
 * guard are enforced by the `connect_people` RPC.
 *
 * A new parent line can bring the parent's partners along as the child's
 * other parents (`coParentIds`), in the same call (Step 77.5): one request
 * and one redraw rather than one each. `connect_people` writes one line, so
 * they're drawn one after another; the first refused stops the rest, and
 * the main line stays — `alsoAdded` and `missed` say how far it got.
 */
export async function connectExistingPeople(input: {
  /** The tree the line is drawn on; both people must be shown on it. */
  treeId: string;
  personId: string;
  otherId: string;
  kind: RelationshipKind | "sibling";
  marriage_date?: string | null;
  /** A wedding day without its year, in place of `marriage_date` (Step 63). */
  marriage_month?: number | null;
  marriage_day?: number | null;
  is_divorced?: boolean;
  divorce_date?: string | null;
  /** The new parent's partners, as the child's other parents too. */
  coParentIds?: string[];
}): Promise<{
  error?: string;
  alsoAdded?: string[];
  missed?: { id: string; error: string };
}> {
  await requireProfile();
  if (!input.personId || !input.otherId) {
    return { error: "Pick someone to connect to." };
  }
  if (input.personId === input.otherId) {
    return { error: "A person can't connect to themselves." };
  }

  // Orient the edge. parent edges are stored from = parent, to = child;
  // spouse / sibling edges are undirected (the RPC orders them).
  let from = input.personId;
  let to = input.otherId;
  let type: "parent" | "spouse" | "sibling" = "parent";
  if (input.kind === "spouse") {
    type = "spouse";
  } else if (input.kind === "sibling") {
    type = "sibling";
  } else if (input.kind === "child") {
    from = input.otherId;
    to = input.personId;
  }

  const supabase = await createClient();
  const connect = async (
    edge: { from: string; to: string; type: typeof type },
    dates: StoredSpouseDates,
  ): Promise<string | null> => {
    const { error } = await supabase.rpc("connect_people", {
      p_from: edge.from,
      p_to: edge.to,
      p_type: edge.type,
      p_marriage_date: dates.marriage_date ?? undefined,
      p_marriage_month: dates.marriage_month ?? undefined,
      p_marriage_day: dates.marriage_day ?? undefined,
      p_is_divorced: dates.is_divorced,
      p_divorce_date: dates.divorce_date ?? undefined,
      p_tree: input.treeId,
    });
    return error
      ? friendlyDbError(
          error.message,
          [DIVORCE_AFTER_MARRIAGE, ...CONNECTION_RULES],
          "Couldn't save these entries. Check the fields and try again.",
        )
      : null;
  };

  // Only a marriage carries dates.
  const refused = await connect(
    { from, to, type },
    normalizeSpouseDates(type === "spouse" ? input : {}),
  );
  if (refused) return { error: refused };

  // The child's other parents, when the new line is a parent's.
  const alsoAdded: string[] = [];
  let missed: { id: string; error: string } | undefined;
  if (type === "parent") {
    const noDates = normalizeSpouseDates({});
    for (const coParentId of new Set(input.coParentIds ?? [])) {
      if (!coParentId || coParentId === from || coParentId === to) continue;
      const error = await connect({ from: coParentId, to, type }, noDates);
      if (error) {
        missed = { id: coParentId, error };
        break;
      }
      alsoAdded.push(coParentId);
    }
  }
  revalidateTreePages();
  return { alsoAdded, ...(missed ? { missed } : {}) };
}

/**
 * Remove a relationship edge. Admin, the edge's creator, or a branch admin with
 * both ends on their branch (enforced by the `relationships_delete` RLS policy).
 */
export async function removeRelationship(
  relationshipId: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  // RLS filters the row out for anyone but its creator, a Root, or a Branch
  // with both ends of the line on their branch.
  const removed = await ownedWrite(
    supabase.from("relationships").delete().eq("id", relationshipId).select("id"),
    {
      refused:
        "Only the connection's creator, a Branch for this side of the family, or a Root can remove it.",
      failed: "Couldn't remove that connection. Try again.",
    },
  );
  if (removed.error) return { error: removed.error };
  revalidateTreePages();
  return {};
}

/**
 * Update an existing person entry. Owner, admin, or a branch admin on their
 * branch (enforced by RLS).
 */
export async function updatePerson(
  personId: string,
  values: PersonFormValues,
  photo?: PhotoChange | null,
): Promise<PersonActionState> {
  const profile = await requireProfile();
  const parsed = personSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields and try again." };
  }
  if (photo && "path" in photo) {
    const owner = photoPathOwner(photo.path);
    if (owner?.kind !== "person" || owner.personId !== personId) {
      return { error: "That photo isn't this entry's." };
    }
  }
  const payload = toPersonPayload(parsed.data);

  const update: TablesUpdate<"people"> = {
    first_name: payload.first_name,
    middle_name: payload.middle_name,
    preferred_name: payload.preferred_name,
    maiden_name: payload.maiden_name,
    last_name: payload.last_name,
    date_of_birth: payload.date_of_birth,
    date_of_birth_precision: payload.date_of_birth_precision,
    birth_month: payload.birth_month,
    birth_day: payload.birth_day,
    date_of_birth_circa: payload.date_of_birth_circa,
    place_id_birth: payload.place_id_birth,
    city_of_birth: payload.city_of_birth,
    country_of_birth: payload.country_of_birth,
    is_deceased: payload.is_deceased,
    date_of_death: payload.date_of_death,
    date_of_death_precision: payload.date_of_death_precision,
    date_of_death_circa: payload.date_of_death_circa,
    place_id_death: payload.place_id_death,
    place_of_death: payload.place_of_death,
    sex: payload.sex,
    ...(photo && "path" in photo ? { photo_path: photo.path } : {}),
    ...(photo ? { photo_crop: toStoredCrop(photo.crop) } : {}),
  };
  const supabase = await createClient();
  const { data: home } = await supabase
    .from("people")
    .select("tree_id, owner_user_id")
    .eq("id", personId)
    .maybeSingle();
  // lineage_type is a home-tree Root's alone; the DB trigger rejects other
  // writers, so only send it when the caller is one.
  if (home && (await getRoleIn(home.tree_id)) === "admin") {
    update.lineage_type = payload.lineage_type ?? null;
  }
  // Contact details are the entry owner's alone: anyone else's form never
  // showed them, so writing its blanks would wipe them.
  if (home?.owner_user_id === profile.auth_user_id) {
    update.email = payload.email;
    update.email_visible = payload.email_visible;
  }
  void profile;

  const saved = await ownedWrite(
    supabase.from("people").update(update).eq("id", personId).select("id"),
    { refused: NOT_YOURS_TO_EDIT, failed: friendlyError },
  );
  if (saved.error) return { error: saved.error };

  revalidateTreePages();
  return { personId };
}

/** What a refused fill says (Step 44), by the `FILL_BLANKS` reason. */
function friendlyFillError(message: string): string {
  return friendlyDbError(
    message,
    [
      [
        "not yours to fill in",
        "This entry isn't yours to fill in any more. Someone may have claimed it; refresh and look again.",
      ],
      ["photo", "The photo didn't reach this entry. Try adding it again."],
      [
        "longer than",
        "One of those is too long. Keep names under 120 characters.",
      ],
      ...ENTRY_RULES,
    ],
    "Couldn't save this entry. Check the fields and try again.",
  );
}

/**
 * Fill in what's missing on an entry the caller can't edit (Step 44): a
 * Branch or a Leaf, on an unclaimed entry on their own line. The
 * `fill_person_blanks` RPC decides who may, and sets only what's empty — it
 * never changes or clears a value, so sending the whole form is safe. A photo
 * is uploaded into the entry's folder first (the storage policy allows that
 * while it has none) and named here. Returns what was filled in.
 */
export async function fillPersonBlanks(
  personId: string,
  values: PersonFormValues,
  photo?: { path: string; crop: CropTransform } | null,
): Promise<{ filled?: string[]; error?: string }> {
  await requireProfile();
  const parsed = personSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields and try again." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fill_person_blanks", {
    p_person: personId,
    p_fields: fillFields(
      toPersonPayload(parsed.data),
      photo ? { path: photo.path, crop: toStoredCrop(photo.crop) } : null,
    ),
  });
  if (error) return { error: friendlyFillError(error.message) };
  revalidateTreePages();
  return { filled: data ?? [] };
}

/**
 * Persist a drag as a *nudge* from the card's auto-layout position, so it keeps
 * following the tree as relatives are added instead of freezing in place. Also
 * clears any legacy absolute pin on the row, converting it on first drag.
 * Owner, admin, or a branch admin on their branch (RLS).
 */
export async function setPersonPosition(
  treeId: string,
  personId: string,
  dx: number,
  dy: number,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  // The card's place on *this* canvas (Step 25): a person shown on two trees
  // sits wherever each tree put them.
  const moved = await ownedWrite(
    supabase
      .from("tree_placements")
      .update({
        pos_dx: Math.round(dx),
        pos_dy: Math.round(dy),
        pos_x: null,
        pos_y: null,
      })
      .eq("tree_id", treeId)
      .eq("person_id", personId)
      .select("id"),
    {
      refused: NOT_YOURS_TO_MOVE,
      failed: (m) =>
        friendlyDbError(
          m,
          [[RLS_REFUSED, NOT_YOURS_TO_MOVE], ...ENTRY_RULES],
          "Couldn't save this entry. Check the fields and try again.",
        ),
    },
  );
  if (moved.error) return { error: moved.error };
  revalidateTreePages();
  return {};
}

/**
 * Drop every manual nudge and legacy pin in the tree, handing the whole canvas
 * back to the auto-layout. Admin only — it discards other people's placements.
 */
export async function autoArrangeTree(
  treeId: string,
): Promise<{ error?: string }> {
  const { error: notRoot } = await rootOf(treeId);
  if (notRoot) return { error: "Only a Root can re-arrange the whole tree." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("tree_placements")
    .update({ pos_dx: null, pos_dy: null, pos_x: null, pos_y: null })
    .eq("tree_id", treeId);
  if (error) return { error: friendlyError(error.message) };

  // Companions hang off the people, so their nudges go with the same sweep.
  await supabase
    .from("pets")
    .update({ pos_dx: null, pos_dy: null })
    .eq("tree_id", treeId);
  revalidateTreePages();
  return {};
}

/**
 * Point a person row at an uploaded photo (or clear it). Only a photo in
 * this entry's own folder (Step 77.4): anything else could be another
 * entry's file.
 */
export async function setPersonPhoto(
  personId: string,
  photoPath: string | null,
  crop?: CropTransform,
): Promise<{ error?: string }> {
  await requireProfile();
  if (photoPath !== null) {
    const owner = photoPathOwner(photoPath);
    if (owner?.kind !== "person" || owner.personId !== personId) {
      return { error: "That photo isn't this entry's." };
    }
  }
  const supabase = await createClient();
  const saved = await ownedWrite(
    supabase
      .from("people")
      .update({
        photo_path: photoPath,
        photo_crop: photoPath && crop ? toStoredCrop(crop) : null,
      })
      .eq("id", personId)
      .select("id"),
    { refused: NOT_YOURS_TO_EDIT, failed: friendlyError },
  );
  if (saved.error) return { error: saved.error };
  revalidateTreePages();
  return {};
}

/** Re-frame a photo that is already uploaded — no new file involved. */
export async function setPersonPhotoCrop(
  personId: string,
  crop: CropTransform,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const saved = await ownedWrite(
    supabase
      .from("people")
      .update({ photo_crop: toStoredCrop(crop) })
      .eq("id", personId)
      .select("id"),
    { refused: NOT_YOURS_TO_EDIT, failed: friendlyError },
  );
  if (saved.error) return { error: saved.error };
  revalidateTreePages();
  return {};
}

export type PersonDocument = {
  id: string;
  file_name: string;
  mime_type: string;
  created_at: string;
  /** Uploaded onto the tree being viewed, rather than shared in from another. */
  fromThisTree: boolean;
  /** Visible on every tree the person is shown on. */
  shared: boolean;
};

/**
 * This tree's bank of documents for an entry (Step 25): the ones uploaded
 * onto it, plus any the person shares across their trees. RLS decides which
 * of those the caller may see. The documents list reads these itself, and no
 * page draws them, so the actions below change them without drawing any
 * page again (Step 61).
 */
export async function listDocuments(
  treeId: string,
  personId: string,
): Promise<PersonDocument[]> {
  await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select(
      "id, file_name, mime_type, created_at, tree_id, shared_across_trees",
    )
    .eq("person_id", personId)
    .or(`tree_id.eq.${treeId},shared_across_trees.eq.true`)
    .order("created_at", { ascending: false });
  return (data ?? []).map((d) => ({
    id: d.id,
    file_name: d.file_name,
    mime_type: d.mime_type,
    created_at: d.created_at,
    fromThisTree: d.tree_id === treeId,
    shared: d.shared_across_trees,
  }));
}

/**
 * Share a document with every tree the person is shown on, or keep it to the
 * tree it was uploaded onto. The person themselves or a Root of their home
 * tree may flip it (`documents_guard`).
 */
export async function setDocumentShared(
  documentId: string,
  shared: boolean,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const saved = await ownedWrite(
    supabase
      .from("documents")
      .update({ shared_across_trees: shared })
      .eq("id", documentId)
      .select("id"),
    {
      refused: "Only someone who can edit this entry can change its documents.",
      failed: (m) =>
        friendlyDbError(
          m,
          [
            [
              "share a document",
              "Only this person, or a Root of their home tree, can share a document across trees.",
            ],
            ...ENTRY_RULES,
          ],
          "Couldn't save this entry. Check the fields and try again.",
        ),
    },
  );
  return saved.error ? { error: saved.error } : {};
}

/** Record a document already uploaded to the `documents` bucket by the client. */
export async function recordDocument(input: {
  treeId: string;
  personId: string;
  filePath: string;
  fileName: string;
  mimeType: string;
}): Promise<{ error?: string }> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("documents").insert({
    tree_id: input.treeId,
    person_id: input.personId,
    file_path: input.filePath,
    file_name: input.fileName,
    mime_type: input.mimeType,
    uploaded_by: profile.auth_user_id,
  });
  if (error) return { error: friendlyError(error.message) };
  return {};
}

export async function removeDocument(
  documentId: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("file_path")
    .eq("id", documentId)
    .maybeSingle();

  // RLS filters a refused delete rather than raising — say so, rather than
  // letting the list drop a document that is still there.
  const removed = await ownedWrite(
    supabase.from("documents").delete().eq("id", documentId).select("id"),
    {
      refused: "Only someone who can edit this entry can remove its documents.",
      failed: friendlyError,
    },
  );
  if (removed.error) return { error: removed.error };

  if (doc?.file_path) {
    await supabase.storage.from("documents").remove([doc.file_path]);
  }
  return {};
}

/** Short-lived signed URL for downloading a document. */
export async function signDocument(
  documentId: string,
): Promise<{ url?: string; error?: string }> {
  await requireProfile();
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("file_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc?.file_path)
    return { error: "That document is no longer available." };

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(doc.file_path, 60);
  if (error || !data) return { error: "Couldn't prepare the download." };
  return { url: data.signedUrl };
}

/**
 * Root: undo a Branch's edit to an entry a Root added (Step 22.4). The edit
 * published at once; `revert_entry_edit` puts back each field it changed that
 * nobody has changed since, and tells the Branch.
 */
export async function revertEntryEdit(
  revisionId: string,
): Promise<{ error?: string; restored?: number }> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revert_entry_edit", {
    p_revision_id: revisionId,
  });
  if (error) {
    if (error.message.includes("ALREADY_REVERTED")) {
      return { error: "That change has already been undone." };
    }
    if (error.message.includes("NOTHING_TO_REVERT")) {
      return {
        error:
          "Those details have been changed again since, so there's nothing left of this edit to undo.",
      };
    }
    if (error.message.includes("REVISION_NOT_FOUND")) {
      return { error: "That entry no longer exists." };
    }
    return { error: friendlyError(error.message) };
  }
  revalidateTreePages();
  return { restored: data?.length ?? 0 };
}
