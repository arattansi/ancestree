"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import {
  personSchema,
  toPersonPayload,
  type PersonFormValues,
} from "@/lib/person-schema";
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

/**
 * First-run onboarding: create the signed-in member's own person entry and
 * link `profiles.self_person_id`. Runs through a SECURITY DEFINER RPC so both
 * writes land together.
 */
export async function createSelfPerson(
  values: PersonFormValues,
): Promise<PersonActionState> {
  const profile = await requireProfile();
  if (profile.self_person_id) {
    return { error: "Your own entry already exists." };
  }

  const parsed = personSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields and try again." };
  }
  const payload = toPersonPayload(parsed.data);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_self_person", {
    p_given_name: payload.given_name ?? "",
    p_preferred_name: payload.preferred_name ?? "",
    p_family_name: payload.family_name,
    p_country_of_birth: payload.country_of_birth,
    p_is_deceased: payload.is_deceased,
    p_date_of_birth: payload.date_of_birth ?? undefined,
    p_city_of_birth: payload.city_of_birth ?? undefined,
    p_date_of_death: payload.date_of_death ?? undefined,
    p_place_of_death: payload.place_of_death ?? undefined,
  });

  if (error || !data) {
    return { error: friendlyError(error?.message) };
  }

  revalidatePath("/tree");
  revalidatePath("/onboarding");
  return { personId: data };
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
    given_name: payload.given_name,
    preferred_name: payload.preferred_name,
    family_name: payload.family_name,
    date_of_birth: payload.date_of_birth,
    city_of_birth: payload.city_of_birth,
    country_of_birth: payload.country_of_birth,
    is_deceased: payload.is_deceased,
    date_of_death: payload.date_of_death,
    place_of_death: payload.place_of_death,
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
