"use server";

import { requireProfile } from "@/lib/auth";
import {
  personSchema,
  toPersonPayload,
  type PersonFormValues,
} from "@/lib/person-schema";
import { revalidateTreePages } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { suggestionValues } from "@/lib/suggestions";

const MAX_NOTE = 500;

/** What a refused suggestion says, by `suggest_entry_change`'s reason. */
function friendlySuggestError(message: string): string {
  if (message.includes("yours to edit")) {
    return "This entry is yours to edit. Edit it instead.";
  }
  if (message.includes("not on your tree")) {
    return "This entry isn't on your tree any more.";
  }
  if (message.includes("nothing changed")) {
    return "That’s what the entry already says.";
  }
  if (message.includes("doesn't fit")) {
    return "Those details don’t fit together. Check them and try again.";
  }
  if (message.includes("longer than")) {
    return "One of those is too long.";
  }
  if (message.includes("no longer exists")) {
    return "That entry no longer exists.";
  }
  return "Couldn’t send that. Try again.";
}

/**
 * Suggest a change to an entry the caller can't edit (Step 67), from the
 * tree they're looking at: every detail as they think it should read, and a
 * note. `suggest_entry_change` keeps what differs, replaces their earlier
 * suggestion for the entry, and asks its owner, the Roots of its home tree
 * and the Branches there who tend it (Step 68). Returns the details it
 * suggests changing.
 */
export async function suggestEntryChange(input: {
  treeId: string;
  personId: string;
  values: PersonFormValues;
  note: string;
}): Promise<{ details?: string[]; error?: string }> {
  await requireProfile();
  const parsed = personSchema.safeParse(input.values);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields and try again." };
  }
  const note = input.note.trim();
  if (note.length > MAX_NOTE) {
    return { error: `Keep the note under ${MAX_NOTE} characters.` };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("suggest_entry_change", {
    p_person: input.personId,
    p_tree: input.treeId,
    p_values: suggestionValues(toPersonPayload(parsed.data)),
    p_note: note,
  });
  if (error) return { error: friendlySuggestError(error.message) };
  revalidateTreePages();
  return { details: data ?? [] };
}

/**
 * Accept or decline a suggested change (Step 67): anyone who may edit the
 * entry. Accepting makes the change as their own edit; declining may say why
 * (Step 69), which the suggester reads in the notice. Returns the details it
 * changed.
 */
export async function decideEntrySuggestion(
  suggestionId: string,
  accept: boolean,
  reason?: string,
): Promise<{ changed?: string[]; error?: string }> {
  await requireProfile();
  const why = accept ? "" : (reason ?? "").trim();
  if (why.length > MAX_NOTE) {
    return { error: `Keep the reason under ${MAX_NOTE} characters.` };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_entry_suggestion", {
    p_suggestion: suggestionId,
    p_accept: accept,
    ...(why ? { p_reason: why } : {}),
  });
  if (error) {
    const m = error.message;
    if (m.includes("withdrawn")) return { error: "It was withdrawn." };
    if (m.includes("already answered")) {
      return { error: "Someone has already answered it." };
    }
    if (m.includes("not yours to answer")) {
      return { error: "Only someone who can edit this entry can answer it." };
    }
    if (m.includes("no longer fits")) {
      return {
        error:
          "The entry has changed since, and this no longer fits. Edit the entry, or decline this.",
      };
    }
    return { error: "Couldn’t answer that. Try again." };
  }
  revalidateTreePages();
  return { changed: data ?? [] };
}

/** Withdraw the caller's own suggested change while it waits (Step 67). */
export async function withdrawEntrySuggestion(
  suggestionId: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entry_suggestions")
    .delete()
    .eq("id", suggestionId)
    .select("id");
  if (error) return { error: "Couldn’t withdraw it. Try again." };
  if (!data || data.length === 0) {
    return { error: "It’s already been answered." };
  }
  revalidateTreePages();
  return {};
}

/**
 * Take one of the caller's declined suggestions off their card (Step 73).
 * It stays declined, and stays on the notices of those who were asked; the
 * update policy lets only its suggester set this, only on a declined one.
 */
export async function dismissEntrySuggestion(
  suggestionId: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entry_suggestions")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", suggestionId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: "Couldn’t dismiss it. Refresh and try again." };
  }
  revalidateTreePages();
  return {};
}
