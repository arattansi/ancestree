"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { blogHref, blogSubmissionHref } from "@/lib/blog";
import { toPost } from "@/lib/blog.server";
import { LIBRARY_SUBMISSION_PHOTO_MAX_MB } from "@/lib/limits";
import { readChangeMessage, readSubmissionFields } from "@/lib/library-submissions";
import {
  askForChange,
  PHOTO_TYPES,
  submitStory,
  SUBMISSION_BUCKET,
} from "@/lib/library-submissions.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isBetaReviewer } from "@/lib/tree-requests.server";

export type SubmitStoryResult =
  | { token: string | null; emailed: boolean; email: string }
  | { error: string };

/**
 * A story sent in from /library/submit (Step 157), signed out or in: the
 * draft form's fields, the sender's email, their agreement to edits and a
 * photo the browser has already shrunk. Saved, and a copy emailed back.
 * A form a bot filled in (the hidden `website` field) is answered as sent
 * and goes nowhere.
 */
export async function submitLibraryStory(formData: FormData): Promise<SubmitStoryResult> {
  let people: unknown = [];
  try {
    people = JSON.parse(String(formData.get("people") ?? "[]"));
  } catch {
    people = [];
  }
  const fields = readSubmissionFields({
    email: formData.get("email"),
    title: formData.get("title"),
    body: formData.get("body"),
    kind: formData.get("kind"),
    people,
    agreed: formData.get("agreed"),
  });
  if (!fields.ok) return { error: fields.error };
  if (String(formData.get("website") ?? "").trim()) {
    return { token: null, emailed: true, email: fields.email };
  }

  const photo = formData.get("photo");
  const photoFile = photo instanceof File && photo.size > 0 ? photo : null;
  if (photoFile) {
    if (!PHOTO_TYPES[photoFile.type]) return { error: "The photo must be a JPEG, PNG or WebP." };
    if (photoFile.size > LIBRARY_SUBMISSION_PHOTO_MAX_MB * 1024 * 1024) {
      return { error: `Keep the photo under ${LIBRARY_SUBMISSION_PHOTO_MAX_MB} MB.` };
    }
  }

  const sent = await submitStory(fields, photoFile);
  if (!sent.ok) return { error: sent.error };
  revalidatePath("/admin");
  return { token: sent.token, emailed: sent.emailed, email: fields.email };
}

/** A change asked for from a copy's page; the reviewers see it on the admin page. */
export async function askLibraryChange(
  token: string,
  message: string,
): Promise<{ error?: string }> {
  const read = readChangeMessage(message);
  if (!read.ok) return { error: read.error };
  const refused = await askForChange(token, read.message);
  if (refused) return { error: refused };
  revalidatePath(blogSubmissionHref(token));
  revalidatePath("/admin");
  return {};
}

const NOT_REVIEWER = "Only a beta reviewer can triage the library.";

/**
 * Reviewer: a story sent in made a draft post, its photo copied in as the
 * cover. Answers the post's id, so the blog tab opens it to edit.
 */
export async function draftLibrarySubmission(
  id: string,
): Promise<{ id: string } | { error: string }> {
  if (!(await isBetaReviewer())) return { error: NOT_REVIEWER };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("draft_library_submission", { p_id: id });
  if (error || !data) {
    return {
      error: error?.message.includes("ALREADY_DRAFTED")
        ? "It’s a draft already."
        : "Could not make it a draft. Try again.",
    };
  }
  const post = toPost(data);
  revalidatePath("/admin");
  revalidatePath(blogHref());

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("library_submissions")
    .select("photo_path")
    .eq("id", id)
    .maybeSingle();
  if (row?.photo_path) {
    const ext = row.photo_path.split(".").pop() || "jpg";
    const cover = `${post.id}/${randomUUID()}.${ext}`;
    const { error: copied } = await admin.storage
      .from(SUBMISSION_BUCKET)
      .copy(row.photo_path, cover, { destinationBucket: "library" });
    const { error: set } = copied
      ? { error: copied }
      : await supabase.rpc("set_blog_post_cover", { p_id: post.id, p_path: cover });
    if (copied || set) {
      console.error("[library] submission photo not made the cover", (copied ?? set)?.message);
      if (!copied) after(() => void admin.storage.from("library").remove([cover]));
      return { error: "The draft is made, but without its photo." };
    }
  }
  return { id: post.id };
}

/** Reviewer: a story set aside, or back to waiting. */
export async function closeLibrarySubmission(
  id: string,
  closed: boolean,
): Promise<{ error?: string }> {
  if (!(await isBetaReviewer())) return { error: NOT_REVIEWER };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_library_submission_status", {
    p_id: id,
    p_status: closed ? "closed" : "new",
  });
  if (error) return { error: "Could not change it. Try again." };
  revalidatePath("/admin");
  return {};
}

/** Reviewer: a change asked for seen to, or not yet. */
export async function resolveLibraryChange(
  id: string,
  resolved: boolean,
): Promise<{ error?: string }> {
  if (!(await isBetaReviewer())) return { error: NOT_REVIEWER };
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_library_change", {
    p_id: id,
    p_resolved: resolved,
  });
  if (error) return { error: "Could not change it. Try again." };
  revalidatePath("/admin");
  return {};
}

/** Reviewer: a story sent in deleted, and its photo's file; a post made from it stays. */
export async function deleteLibrarySubmission(id: string): Promise<{ error?: string }> {
  if (!(await isBetaReviewer())) return { error: NOT_REVIEWER };
  const supabase = await createClient();
  const { data: photo, error } = await supabase.rpc("delete_library_submission", { p_id: id });
  if (error) return { error: "Could not delete it. Try again." };
  if (photo) {
    after(async () => {
      const { error: removed } = await createAdminClient()
        .storage.from(SUBMISSION_BUCKET)
        .remove([photo]);
      if (removed) console.error("[library] submission photo not removed", removed.message);
    });
  }
  revalidatePath("/admin");
  return {};
}
