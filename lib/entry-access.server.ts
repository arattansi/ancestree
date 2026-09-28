import "server-only";

import type { AccountTypeKey } from "@/lib/account-types";
import type { Profile } from "@/lib/auth";
import { canEditEntry, canFillEntry, type EntrySubject } from "@/lib/branch";
import { getSpokenForEntryIds, getViewer } from "@/lib/branch.server";
import { createClient } from "@/lib/supabase/server";
import { getRoleIn } from "@/lib/tree-context";

/**
 * What the viewer may do with an entry's details: edit them, or only fill in
 * what's missing (Step 44). Details follow the HOME tree's rules (Step 25):
 * who the viewer is there decides, even when they opened the entry from
 * another tree, and someone who isn't a member there may edit only their own
 * entry. Anyone else on a tree it's shown on may suggest a change (Step 67).
 * The database decides again on every write.
 */
export async function entryAccess(
  profile: Profile,
  person: {
    id: string;
    home_tree_id: string;
    owner_user_id: string;
    created_by: string;
  },
): Promise<{
  canEdit: boolean;
  canFill: boolean;
  /** Their account type on the entry's home tree, if they're on it. */
  homeRole: AccountTypeKey | null;
}> {
  const supabase = await createClient();
  const [{ data: approvedClaim }, homeRole, spokenFor] = await Promise.all([
    supabase
      .from("claims")
      .select("id")
      .eq("person_id", person.id)
      .eq("status", "approved")
      .maybeSingle(),
    getRoleIn(person.home_tree_id),
    getSpokenForEntryIds(profile.auth_user_id),
  ]);
  const viewer = homeRole
    ? await getViewer(profile, homeRole, person.home_tree_id)
    : null;
  const subject: EntrySubject = {
    id: person.id,
    owner_user_id: person.owner_user_id,
    created_by: person.created_by,
    isClaimed: !!approvedClaim,
    isSomeoneElsesOwn: spokenFor.has(person.id),
  };
  const canEdit = viewer
    ? canEditEntry(subject, viewer)
    : person.id === profile.self_person_id;
  return {
    canEdit,
    canFill: !canEdit && !!viewer && canFillEntry(subject, viewer),
    homeRole,
  };
}
