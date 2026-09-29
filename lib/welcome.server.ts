import "server-only";

import { personDisplayName } from "@/lib/person-name";
import { createClient } from "@/lib/supabase/server";

/**
 * Who invited a member onto a tree (`tree_members.invited_by_user_id`, set
 * as each invite is redeemed), named the way notifications name members
 * (`private.member_label`): their own entry's name, else the name they go
 * by. `null` when nobody did — a Root who came in from the allowlist — or
 * they can't be named any more.
 */
export async function inviterName(
  treeId: string,
  userId: string,
): Promise<string | null> {
  const supabase = await createClient();
  // The tree's members in one read, them and their inviter both (Step 77.1).
  const { data: members } = await supabase
    .from("member_directory")
    .select(
      "auth_user_id, invited_by_user_id, invited_by_name, self_person_id, display_name",
    )
    .eq("tree_id", treeId);
  const me = (members ?? []).find((m) => m.auth_user_id === userId);
  const inviterId = me?.invited_by_user_id;
  if (!inviterId || inviterId === userId) return null;

  const inviter = (members ?? []).find((m) => m.auth_user_id === inviterId);
  if (inviter?.self_person_id) {
    const { data: entry } = await supabase
      .from("tree_people")
      .select("first_name, preferred_name, last_name")
      .eq("tree_id", treeId)
      .eq("id", inviter.self_person_id)
      .maybeSingle();
    if (entry?.last_name) return personDisplayName(entry);
  }
  return (
    inviter?.display_name?.trim() || me?.invited_by_name?.trim() || null
  );
}
