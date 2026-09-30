"use server";

import { requireProfile } from "@/lib/auth";
import { ownedWrite } from "@/lib/db-errors";
import { isDocumentOf } from "@/lib/document-path";
import { friendlyEntryError } from "@/lib/entry-errors";
import { removeDocumentsLater } from "@/lib/file-cleanup.server";
import { createClient } from "@/lib/supabase/server";

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
 * Record a document already uploaded to the `documents` bucket by the client.
 * When it can't be recorded, the upload goes (Step 90): with no row, the
 * uploader's own client can't see the file to remove it.
 */
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
  if (error) {
    // Only an upload for this entry, and only while nothing records it.
    if (isDocumentOf(input.filePath, input.treeId, input.personId)) {
      removeDocumentsLater([input.filePath]);
    }
    return { error: friendlyEntryError(error.message) };
  }
  return {};
}

/**
 * Remove a document. Its row goes first, as the caller: that's what proves
 * the right. Its file goes after the response with the service role
 * (Step 90), since storage only shows a document's file while its row is
 * there, so the caller's own client could no longer remove it.
 */
export async function removeDocument(
  documentId: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();

  // RLS filters a refused delete rather than raising — say so, rather than
  // letting the list drop a document that is still there.
  const removed = await ownedWrite(
    supabase
      .from("documents")
      .delete()
      .eq("id", documentId)
      .select("file_path"),
    {
      refused: "Only someone who can edit this entry can remove its documents.",
      failed: friendlyEntryError,
    },
  );
  if (removed.error !== undefined) return { error: removed.error };

  removeDocumentsLater(removed.rows.map((row) => row.file_path));
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
