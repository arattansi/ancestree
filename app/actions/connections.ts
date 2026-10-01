"use server";

import { OWN_LINE_REFUSAL, isOwnLineRefusal } from "@/lib/account-types";
import { requireProfile, type Profile } from "@/lib/auth";
import { bloodTieRefusal, readBloodTieRefusal } from "@/lib/bloodline";
import { mintClaimInvite } from "@/lib/claim-invite-send.server";
import { readMinorRefusal, underAgeMessage } from "@/lib/minors";
import {
  friendlyDbError,
  ownedWrite,
  RLS_REFUSED,
  type ErrorRule,
} from "@/lib/db-errors";
import { NO_PERMISSION } from "@/lib/entry-errors";
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
import type {
  ImpliedConnection,
  NewPersonInput,
  SuggestedType,
  SuggestionSource,
} from "@/lib/connection-suggestions";
import { revalidateTreePages } from "@/lib/revalidate";
import { getRoleIn } from "@/lib/tree-context";
import { createClient } from "@/lib/supabase/server";

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
  const pPeople = people.map((values, i) => {
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
      // "18 or older?" (Step 98): the database refuses a child under 18, or
      // one nobody said yes for, unless the member is their parent.
      adult: input.adults?.[i] ?? null,
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
    const minor = readMinorRefusal(error);
    return {
      error: refusal
        ? bloodTieRefusal(refusal, input.selfIndex)
        : minor
          ? underAgeMessage(minor.name)
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
