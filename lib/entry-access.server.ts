import "server-only";

import { cache } from "react";

import type { AccountTypeKey } from "@/lib/account-types";
import type { Profile } from "@/lib/auth";
import { entryRights, type EntrySubject } from "@/lib/branch";
import { getViewer } from "@/lib/branch.server";
import { createClient } from "@/lib/supabase/server";
import { getRoleIn } from "@/lib/tree-context";

/**
 * Who is behind an entry: an approved claim, or another member's own entry.
 * Asked of this one entry (not of every profile and claim there is, Step
 * 77.1), and needing only its id, so a page can start it with its first
 * reads. Once per request.
 */
export const entryFacts = cache(
  async (
    personId: string,
    viewerUserId: string,
  ): Promise<{ isClaimed: boolean; isSomeoneElsesOwn: boolean }> => {
    const supabase = await createClient();
    const [{ data: approvedClaim }, { data: owners }] = await Promise.all([
      supabase
        .from("claims")
        .select("id")
        .eq("person_id", personId)
        .eq("status", "approved")
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("auth_user_id")
        .eq("self_person_id", personId)
        .neq("auth_user_id", viewerUserId)
        .limit(1),
    ]);
    return {
      isClaimed: !!approvedClaim,
      isSomeoneElsesOwn: !!approvedClaim || (owners ?? []).length > 0,
    };
  },
);

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
  const [facts, homeRole] = await Promise.all([
    entryFacts(person.id, profile.auth_user_id),
    getRoleIn(person.home_tree_id),
  ]);
  const viewer = homeRole
    ? await getViewer(profile, homeRole, person.home_tree_id)
    : null;
  const subject: EntrySubject = {
    id: person.id,
    owner_user_id: person.owner_user_id,
    created_by: person.created_by,
    ...facts,
  };
  return {
    ...entryRights(subject, viewer, profile.self_person_id),
    homeRole,
  };
}
