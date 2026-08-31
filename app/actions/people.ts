"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
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
import {
  detectImpliedConnections,
} from "@/lib/connection-suggestions.server";
import type {
  ImpliedConnection,
  NewPersonInput,
  PendingEdge,
} from "@/lib/connection-suggestions";
import { getSharedTree } from "@/lib/tree";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/database.types";

export type PersonActionState = {
  personId?: string;
  error?: string;
};

function friendlyError(message: string | undefined): string {
  if (!message) return "Something went wrong. Try again.";
  if (message.includes("already exists")) return "Your own entry already exists.";
  if (message.toLowerCase().includes("row-level security")) {
    return "You don't have permission to make that change.";
  }
  return "Couldn't save this entry. Check the fields and try again.";
}

function friendlyConnectionError(message: string | undefined): string {
  if (!message) return "Something went wrong. Try again.";
  const m = message.toLowerCase();
  if (m.includes("already in the tree")) {
    return "These entries don't connect to the tree yet — pick someone already on it, or add the people in between.";
  }
  if (m.includes("parent/child loop")) {
    return "That connection would create a parent/child loop.";
  }
  if (m.includes("your own entry already exists")) {
    return "Your own entry already exists.";
  }
  if (m.includes("not in this tree")) {
    return "The person you're connecting to is no longer on the tree. Refresh and try again.";
  }
  if (m.includes("partners and parent and child")) {
    return "Two people can't be both partners and parent and child.";
  }
  if (m.includes("row-level security")) {
    return "You don't have permission to make that change.";
  }
  return "Couldn't save these entries. Check the fields and try again.";
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
 * existing tree member; the DB RPC enforces that and guards against cycles.
 */
export async function addPeopleWithConnections(
  input: AddPeopleInput,
): Promise<AddPeopleResult> {
  const profile = await requireProfile();

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

  const isAdmin = profile.role === "admin";
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
      is_deceased: p.is_deceased,
      date_of_death: p.date_of_death ?? "",
      place_of_death: p.place_of_death ?? "",
      // lineage_type is admin-only; the DB nulls it for other writers anyway.
      lineage_type: isAdmin ? p.lineage_type : null,
    };
  });

  const pEdges = input.edges.map((e) => ({
    type: e.type,
    a: refToString(e.a),
    b: refToString(e.b),
    ...(e.type === "spouse"
      ? {
          marriage_date: e.marriage_date ?? "",
          is_divorced: e.is_divorced ?? false,
          divorce_date: e.is_divorced ? e.divorce_date ?? "" : "",
        }
      : {}),
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
  });

  if (error || !data) {
    return { error: friendlyConnectionError(error?.message) };
  }

  const result = data as { ids: string[]; self_id: string | null };

  // The RPC still takes only the legacy text place columns; set the canonical
  // `places` FKs (Step 4.5c) on the freshly-created rows. ids align with people.
  const placeUpdates = result.ids
    .map((personId, i) => {
      const values = people[i];
      if (!values) return null;
      const birth = values.place_id_birth ?? null;
      const death = values.is_deceased ? values.place_id_death ?? null : null;
      const sex = values.sex ?? null;
      if (birth == null && death == null && sex == null) return null;
      return supabase
        .from("people")
        .update({ place_id_birth: birth, place_id_death: death, sex })
        .eq("id", personId);
    })
    .filter((q): q is NonNullable<typeof q> => q !== null);
  if (placeUpdates.length > 0) await Promise.all(placeUpdates);

  revalidatePath("/tree");
  revalidatePath("/onboarding");
  return { personIds: result.ids, selfId: result.self_id };
}

/**
 * Run the implied-connection detection engine (Step 11.2) over the edges a
 * pending add-person submit would create, so the flow can show the blocking
 * approval modal before it commits. Read-only.
 */
export async function detectConnections(input: {
  newPeople: NewPersonInput[];
  pendingEdges: PendingEdge[];
}): Promise<{ suggestions?: ImpliedConnection[]; error?: string }> {
  await requireProfile();
  const tree = await getSharedTree();
  if (!tree) return { suggestions: [] };
  try {
    const suggestions = await detectImpliedConnections(tree.id, {
      newPeople: input.newPeople,
      pendingEdges: input.pendingEdges,
    });
    return { suggestions };
  } catch {
    // Detection is advisory — never block an add on its failure.
    return { suggestions: [] };
  }
}

/**
 * Update the optional marriage / divorce fields on a spouse relationship.
 * Gated by the existing `relationships_update` RLS (admin or the edge's
 * `created_by`); the DB CHECKs keep the dates coherent. All fields optional.
 */
export async function updateRelationshipMarriage(
  relationshipId: string,
  input: {
    marriage_date?: string | null;
    is_divorced: boolean;
    divorce_date?: string | null;
  },
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("relationships")
    .update({
      marriage_date: input.marriage_date?.trim() ? input.marriage_date : null,
      is_divorced: input.is_divorced,
      divorce_date:
        input.is_divorced && input.divorce_date?.trim()
          ? input.divorce_date
          : null,
    })
    .eq("id", relationshipId)
    .eq("type", "spouse");
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("divorce_after_marriage")) {
      return { error: "The divorce date can't be before the marriage date." };
    }
    if (m.includes("row-level security")) {
      return { error: "Only the relationship's creator or an admin can edit this." };
    }
    return { error: "Couldn't save those dates. Try again." };
  }
  revalidatePath("/tree");
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
  revalidatePath("/tree");
  return {};
}

/**
 * Link two people who are *both* already in the tree — used by the "Add a
 * connection" card on the edit page. `kind` reads "the person being edited is
 * the {kind} of {otherId}". Membership, the partner/parent guard and the cycle
 * guard are enforced by the `connect_people` RPC.
 */
export async function connectExistingPeople(input: {
  personId: string;
  otherId: string;
  kind: RelationshipKind | "sibling";
  marriage_date?: string | null;
  is_divorced?: boolean;
  divorce_date?: string | null;
}): Promise<{ error?: string }> {
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

  const isSpouse = type === "spouse";
  const isDivorced = isSpouse && (input.is_divorced ?? false);

  const supabase = await createClient();
  const { error } = await supabase.rpc("connect_people", {
    p_from: from,
    p_to: to,
    p_type: type,
    p_marriage_date:
      isSpouse && input.marriage_date?.trim()
        ? input.marriage_date
        : undefined,
    p_is_divorced: isDivorced,
    p_divorce_date:
      isDivorced && input.divorce_date?.trim()
        ? input.divorce_date
        : undefined,
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("divorce_after_marriage")) {
      return { error: "The divorce date can't be before the marriage date." };
    }
    return { error: friendlyConnectionError(error.message) };
  }
  revalidatePath("/tree");
  return {};
}

/**
 * Remove a relationship edge. Admin or the edge's creator only (enforced by the
 * `relationships_delete` RLS policy).
 */
export async function removeRelationship(
  relationshipId: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("relationships")
    .delete()
    .eq("id", relationshipId)
    .select("id");
  if (error) {
    return { error: "Couldn't remove that connection. Try again." };
  }
  if (!data || data.length === 0) {
    // RLS filtered the row out — the caller isn't the creator or an admin.
    return {
      error: "Only the connection's creator or an admin can remove it.",
    };
  }
  revalidatePath("/tree");
  return {};
}

/** Update an existing person entry. Owner or admin only (enforced by RLS). */
export async function updatePerson(
  personId: string,
  values: PersonFormValues,
): Promise<PersonActionState> {
  const profile = await requireProfile();
  const parsed = personSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields and try again." };
  }
  const payload = toPersonPayload(parsed.data);

  const update: TablesUpdate<"people"> = {
    first_name: payload.first_name,
    middle_name: payload.middle_name,
    preferred_name: payload.preferred_name,
    maiden_name: payload.maiden_name,
    last_name: payload.last_name,
    date_of_birth: payload.date_of_birth,
    place_id_birth: payload.place_id_birth,
    city_of_birth: payload.city_of_birth,
    country_of_birth: payload.country_of_birth,
    is_deceased: payload.is_deceased,
    date_of_death: payload.date_of_death,
    place_id_death: payload.place_id_death,
    place_of_death: payload.place_of_death,
    sex: payload.sex,
  };
  // lineage_type is admin-only; the DB trigger rejects other writers.
  if (profile.role === "admin") {
    update.lineage_type = payload.lineage_type ?? null;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update(update)
    .eq("id", personId);

  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/tree");
  return { personId };
}

/**
 * Persist a drag as a *nudge* from the card's auto-layout position, so it keeps
 * following the tree as relatives are added instead of freezing in place. Also
 * clears any legacy absolute pin on the row, converting it on first drag.
 * Owner or admin only (RLS).
 */
export async function setPersonPosition(
  personId: string,
  dx: number,
  dy: number,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({
      pos_dx: Math.round(dx),
      pos_dy: Math.round(dy),
      pos_x: null,
      pos_y: null,
    })
    .eq("id", personId);
  if (error) {
    if (error.message.toLowerCase().includes("row-level security")) {
      return { error: "Only the entry owner or an admin can move this card." };
    }
    return { error: friendlyError(error.message) };
  }
  revalidatePath("/tree");
  return {};
}

/**
 * Drop every manual nudge and legacy pin in the tree, handing the whole canvas
 * back to the auto-layout. Admin only — it discards other people's placements.
 */
export async function autoArrangeTree(
  treeId: string,
): Promise<{ error?: string }> {
  const profile = await requireProfile();
  if (profile.role !== "admin") {
    return { error: "Only an admin can re-arrange the whole tree." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ pos_dx: null, pos_dy: null, pos_x: null, pos_y: null })
    .eq("tree_id", treeId);
  if (error) return { error: friendlyError(error.message) };
  revalidatePath("/tree");
  return {};
}

/** Point a person row at an uploaded photo (or clear it). */
export async function setPersonPhoto(
  personId: string,
  photoPath: string | null,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ photo_path: photoPath })
    .eq("id", personId);
  if (error) return { error: friendlyError(error.message) };
  revalidatePath("/tree");
  return {};
}

export type PersonDocument = {
  id: string;
  file_name: string;
  mime_type: string;
  created_at: string;
};

export async function listDocuments(
  personId: string,
): Promise<PersonDocument[]> {
  await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("id, file_name, mime_type, created_at")
    .eq("person_id", personId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Record a document already uploaded to the `documents` bucket by the client. */
export async function recordDocument(input: {
  personId: string;
  filePath: string;
  fileName: string;
  mimeType: string;
}): Promise<{ error?: string }> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("documents").insert({
    person_id: input.personId,
    file_path: input.filePath,
    file_name: input.fileName,
    mime_type: input.mimeType,
    uploaded_by: profile.auth_user_id,
  });
  if (error) return { error: friendlyError(error.message) };
  revalidatePath("/tree");
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

  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId);
  if (error) return { error: friendlyError(error.message) };

  if (doc?.file_path) {
    await supabase.storage.from("documents").remove([doc.file_path]);
  }
  revalidatePath("/tree");
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
  if (!doc?.file_path) return { error: "That document is no longer available." };

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(doc.file_path, 60);
  if (error || !data) return { error: "Couldn't prepare the download." };
  return { url: data.signedUrl };
}
