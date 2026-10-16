import "server-only";

import { randomUUID } from "node:crypto";

import { blogSubmissionHref, readBlogKind, readBlogPeople } from "@/lib/blog";
import { sendEmail } from "@/lib/email";
import { librarySubmissionEmail } from "@/lib/emails/library";
import {
  peopleNames,
  readChangeRequests,
  readSubmissionStatus,
  submissionRefusal,
  type LibrarySubmission,
  type SentStory,
} from "@/lib/library-submissions";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Stories sent in to the library (Step 157). The sender's side runs with
 * the service role, since they're signed out: the story saved (with the
 * caps `submit_library_story` holds), its photo in the private
 * `library-submissions` bucket, the copy emailed, the copy's page read by
 * its token, a change asked for. The reviewers' list goes through their
 * own session (`list_library_submissions` checks them).
 */

export const SUBMISSION_BUCKET = "library-submissions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How long a photo's signed address works: a page's visit. */
const PHOTO_URL_SECONDS = 60 * 60;

export const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type SubmitResult =
  | { ok: true; token: string; emailed: boolean }
  | { ok: false; error: string };

/**
 * A story sent in: its photo stored first (under a folder of its own, so
 * nothing else's), then the row, whose caps may refuse it (and the photo
 * goes again), then the copy emailed to the address typed. Answers the
 * copy's token, and whether the email went.
 */
export async function submitStory(
  fields: {
    email: string;
    title: string;
    body: string;
    kind: string;
    people: unknown;
  },
  photo: File | null,
): Promise<SubmitResult> {
  const admin = createAdminClient();
  let photoPath: string | null = null;
  if (photo) {
    photoPath = `${randomUUID()}/photo.${PHOTO_TYPES[photo.type] ?? "jpg"}`;
    const { error } = await admin.storage
      .from(SUBMISSION_BUCKET)
      .upload(photoPath, photo, { contentType: photo.type, upsert: false });
    if (error) {
      console.error("[library] submission photo not stored", error.message);
      return { ok: false, error: "The photo didn’t upload. Try again." };
    }
  }

  const { data, error } = await admin.rpc("submit_library_story", {
    p_email: fields.email,
    p_title: fields.title,
    p_body: fields.body,
    p_kind: fields.kind,
    p_people: fields.people as never,
    p_photo_path: photoPath ?? "",
  });
  if (error || !data) {
    if (photoPath) await admin.storage.from(SUBMISSION_BUCKET).remove([photoPath]);
    const refused = submissionRefusal(error?.message);
    if (!refused) console.error("[library] submission not saved", error?.message);
    return { ok: false, error: refused ?? "Could not send it. Try again." };
  }

  const { subject, html } = librarySubmissionEmail({
    title: data.title,
    body: data.body,
    who: peopleNames(readBlogPeople(data.people)),
    withPhoto: !!data.photo_path,
    copyUrl: `${getSiteUrl()}${blogSubmissionHref(data.token)}`,
  });
  const sent = await sendEmail({ to: data.email, subject, html });
  if (!sent.ok) console.error("[library] submission copy not sent", sent.error);
  return { ok: true, token: data.token, emailed: sent.ok };
}

/** The story a copy's token names, as its sender sees it, or `null`. */
export async function readSentStory(token: string): Promise<SentStory | null> {
  if (!UUID.test(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("library_submissions")
    .select(
      "id, title, body, kind, people, photo_path, created_at, blog_posts(slug, published_at), library_change_requests(id, message, resolved_at, created_at)",
    )
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;

  const post = data.blog_posts;
  const photoUrl = data.photo_path ? await signedPhotoUrl(data.photo_path) : null;
  return {
    title: data.title,
    body: data.body,
    kind: readBlogKind(data.kind),
    people: readBlogPeople(data.people),
    photoUrl,
    createdAt: data.created_at,
    publishedSlug: post?.published_at ? post.slug : null,
    changeRequests: data.library_change_requests
      .map((r) => ({
        id: r.id,
        message: r.message,
        resolvedAt: r.resolved_at,
        createdAt: r.created_at,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

/** A change asked for from a copy's page; `null` once it's saved, else why not. */
export async function askForChange(token: string, message: string): Promise<string | null> {
  if (!UUID.test(token)) return "This link doesn’t work.";
  const { error } = await createAdminClient().rpc("ask_library_change", {
    p_token: token,
    p_message: message,
  });
  if (!error) return null;
  const refused = submissionRefusal(error.message);
  if (!refused) console.error("[library] change not saved", error.message);
  return refused ?? "Could not send it. Try again.";
}

/** Every story sent in, waiting first, for the reviewers; `[]` for anyone else. */
export async function listSubmissions(): Promise<LibrarySubmission[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_library_submissions");
  if (error || !data) return [];

  // The reviewer's own list answered, so they may see the photos.
  const paths = data.flatMap((s) => (s.photo_path ? [s.photo_path] : []));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await createAdminClient()
      .storage.from(SUBMISSION_BUCKET)
      .createSignedUrls(paths, PHOTO_URL_SECONDS);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
    }
  }

  return data.map((s) => ({
    id: s.id,
    email: s.email,
    title: s.title,
    body: s.body,
    kind: readBlogKind(s.kind),
    people: readBlogPeople(s.people),
    photoUrl: s.photo_path ? (urls.get(s.photo_path) ?? null) : null,
    status: readSubmissionStatus(s.status),
    post: s.post_id && s.post_slug
      ? { id: s.post_id, slug: s.post_slug, publishedAt: s.post_published_at }
      : null,
    createdAt: s.created_at,
    changeRequests: readChangeRequests(s.change_requests),
  }));
}

/** How many stories and changes wait on a reviewer: 0 for anyone else. */
export async function countSubmissionsWaiting(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("library_triage_count");
  return error || typeof data !== "number" ? 0 : data;
}

async function signedPhotoUrl(path: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .storage.from(SUBMISSION_BUCKET)
    .createSignedUrl(path, PHOTO_URL_SECONDS);
  return data?.signedUrl ?? null;
}
