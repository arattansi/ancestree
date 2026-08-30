"use server";

import { revalidatePath } from "next/cache";

import { listEntryComments, type EntryComment } from "@/lib/entry-comments";
import { requireAdmin, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const MAX_BODY = 2000;

/** Every comment / flag on an entry, for the detail panel. */
export async function getEntryComments(
  personId: string,
): Promise<EntryComment[]> {
  await requireProfile();
  return listEntryComments(personId);
}

/**
 * Add a comment (or a flag when `isFlag`) to an entry. Any tree member may do
 * this; membership is enforced by `entry_comments` RLS. A DB trigger notifies
 * the entry's owner and original creator.
 */
export async function addEntryComment(input: {
  personId: string;
  body: string;
  isFlag: boolean;
}): Promise<{ error?: string; comment?: EntryComment }> {
  const profile = await requireProfile();
  const body = input.body.trim();
  if (!body) return { error: "Write a message first." };
  if (body.length > MAX_BODY) {
    return { error: `Keep it under ${MAX_BODY} characters.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entry_comments")
    .insert({
      person_id: input.personId,
      body,
      is_flag: input.isFlag,
      created_by: profile.auth_user_id,
    })
    .select(
      "id, body, is_flag, status, created_at, created_by, resolved_by, resolved_at",
    )
    .single();

  if (error || !data) {
    return { error: "Couldn't post that. Refresh and try again." };
  }

  revalidatePath("/tree");
  return {
    comment: {
      id: data.id,
      body: data.body,
      isFlag: data.is_flag,
      status: data.status as "open" | "resolved",
      createdAt: data.created_at,
      createdBy: data.created_by,
      authorName: profile.display_name ?? "You",
      resolvedBy: null,
      resolverName: null,
      resolvedAt: null,
    },
  };
}

/** Resolve or reopen a flag (entry owner, an admin, or the flag's author). */
export async function resolveEntryFlag(
  commentId: string,
  resolved: boolean,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_entry_flag", {
    p_comment_id: commentId,
    p_resolved: resolved,
  });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("only the entry owner")) {
      return {
        error:
          "Only the entry owner, an admin, or whoever raised the flag can change it.",
      };
    }
    return { error: "Couldn't update that flag. Try again." };
  }
  revalidatePath("/tree");
  revalidatePath("/account");
  return {};
}

/** Admin-only: mark an entry verified, or clear its verified status. */
export async function setEntryVerified(
  personId: string,
  verified: boolean,
): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_entry_verified", {
    p_person_id: personId,
    p_verified: verified,
  });
  if (error) return { error: "Couldn't update verification. Try again." };
  revalidatePath("/tree");
  revalidatePath("/account");
  return {};
}
