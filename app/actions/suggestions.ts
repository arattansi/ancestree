"use server";

import { requireProfile } from "@/lib/auth";
import { friendlyDbError, ownedWrite } from "@/lib/db-errors";
import { SUGGESTION_NOTE_MAX } from "@/lib/limits";
import {
  personSchema,
  toPersonPayload,
  type PersonFormValues,
} from "@/lib/person-schema";
import { revalidateTreePages } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { suggestionValues } from "@/lib/suggestions";
import { MINOR_DATE_REFUSED } from "@/lib/minors";

/** What a refused suggestion says, by `suggest_entry_change`'s reason. */
function friendlySuggestError(message: string): string {
  return friendlyDbError(
    message,
    [
      ["yours to edit", "This entry is yours to edit. Edit it instead."],
      ["not on your tree", "This entry isn't on your tree any more."],
      ["nothing changed", "That’s what the entry already says."],
      ["doesn't fit", "Those details don’t fit together. Check them and try again."],
      ["longer than", "One of those is too long."],
      ["no longer exists", "That entry no longer exists."],
    ],
    "Couldn’t send that. Try again.",
  );
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
  if (note.length > SUGGESTION_NOTE_MAX) {
    return { error: `Keep the note under ${SUGGESTION_NOTE_MAX} characters.` };
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
  if (why.length > SUGGESTION_NOTE_MAX) {
    return { error: `Keep the reason under ${SUGGESTION_NOTE_MAX} characters.` };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_entry_suggestion", {
    p_suggestion: suggestionId,
    p_accept: accept,
    ...(why ? { p_reason: why } : {}),
  });
  if (error) {
    return {
      error: friendlyDbError(
        error.message,
        [
          ["withdrawn", "It was withdrawn."],
          // Accepting it would give someone a date of birth under 18 (Step 98).
          ["MINOR:", MINOR_DATE_REFUSED],
          ["already answered", "Someone has already answered it."],
          [
            "not yours to answer",
            "Only someone who can edit this entry can answer it.",
          ],
          [
            "no longer fits",
            "The entry has changed since, and this no longer fits. Edit the entry, or decline this.",
          ],
        ],
        "Couldn’t answer that. Try again.",
      ),
    };
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
  const withdrawn = await ownedWrite(
    supabase.from("entry_suggestions").delete().eq("id", suggestionId).select("id"),
    {
      refused: "It’s already been answered.",
      failed: "Couldn’t withdraw it. Try again.",
    },
  );
  if (withdrawn.error) return { error: withdrawn.error };
  revalidateTreePages();
  return {};
}

/**
 * Set or clear `dismissed_at` on one of the caller's declined suggestions.
 * The update policy lets only its suggester write it, only on a declined
 * one, so it stays declined either way. Whether a row changed.
 */
async function setDismissed(
  suggestionId: string,
  dismissed: boolean,
): Promise<boolean> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entry_suggestions")
    .update({ dismissed_at: dismissed ? new Date().toISOString() : null })
    .eq("id", suggestionId)
    .select("id");
  if (error || !data || data.length === 0) return false;
  revalidateTreePages();
  return true;
}

/**
 * Take one of the caller's declined suggestions off their card (Step 73).
 * It stays declined, and stays on the notices of those who were asked.
 */
export async function dismissEntrySuggestion(
  suggestionId: string,
): Promise<{ error?: string }> {
  return (await setDismissed(suggestionId, true))
    ? {}
    : { error: "Couldn’t dismiss it. Refresh and try again." };
}

/**
 * Put a declined suggestion the caller dismissed back on their card, and
 * the form's hint: Dismiss's Undo (Step 74).
 */
export async function restoreEntrySuggestion(
  suggestionId: string,
): Promise<{ error?: string }> {
  return (await setDismissed(suggestionId, false))
    ? {}
    : { error: "Couldn’t put it back. Refresh and try again." };
}
