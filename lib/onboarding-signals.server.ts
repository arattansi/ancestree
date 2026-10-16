import "server-only";

import { isInvitable } from "@/lib/invitable";
import type { StepSignals } from "@/lib/onboarding";
import { createAdminClient } from "@/lib/supabase/admin";
import { readApprovedClaims, readIn } from "@/lib/tree";

/**
 * What one member has done, as the getting started emails judge it
 * (`onboarding_due`, Step 151), for their "Getting started" list on the
 * canvas (Step 170): the list ticks by the same rules (`stepTaken`), so it
 * and the emails agree. Read the way `onboarding_due` reads it, without
 * starting their drip:
 *
 *   claimable     living entries they made, on a tree of theirs, that
 *                 nobody is behind and no live invite is out for
 *   people_added  every entry they made, their own not counted
 *   invited       an invite they made, someone who joined through them, or
 *                 an approved request they answered (an accepted invite is
 *                 deleted as it's redeemed)
 *   shared        a story they wrote or an album photo they put up
 *
 * With the service role, as `listPeopleYouAdded` reads what they made: only
 * rows about this member, who reads them anyway. `null` if any read fails,
 * so a list never ticks on half the facts.
 */
export async function readStepSignals(
  userId: string,
  selfPersonId: string | null,
  treeIds: readonly string[],
): Promise<StepSignals | null> {
  const admin = createAdminClient();
  const [made, invites, joined, answered, stories, photos] = await Promise.all([
    admin
      .from("people")
      .select(
        "id, tree_id, first_name, preferred_name, last_name, is_deceased, date_of_death, owner_user_id, created_by, placeholder_number",
      )
      .eq("created_by", userId),
    admin
      .from("invites")
      .select("id")
      .eq("created_by", userId)
      .eq("founds_tree", false)
      .limit(1),
    admin
      .from("tree_members")
      .select("user_id")
      .eq("invited_by_user_id", userId)
      .neq("user_id", userId)
      .limit(1),
    admin
      .from("invite_requests")
      .select("id")
      .eq("reviewed_by", userId)
      .eq("status", "approved")
      .limit(1),
    admin.from("stories").select("id").eq("created_by", userId).limit(1),
    admin.from("album_photos").select("id").eq("created_by", userId).limit(1),
  ]);
  const failed = [made, invites, joined, answered, stories, photos].find(
    (r) => r.error,
  );
  if (failed?.error) {
    console.error("[onboarding] a member's signals", failed.error.code);
    return null;
  }

  const added = (made.data ?? []).filter((p) => p.id !== selfPersonId);
  const mine = new Set(treeIds);
  // Who could still be invited, before the claims and owners say: living,
  // no placeholder, still its maker's, on a tree of theirs.
  const candidates = added.filter(
    (p) =>
      mine.has(p.tree_id) &&
      isInvitable(p, new Set(), new Set()),
  );
  const ids = candidates.map((p) => p.id);
  const [claims, owners, live] = await Promise.all([
    readApprovedClaims(admin, ids),
    readIn(ids, (chunk) =>
      admin.from("profiles").select("self_person_id").in("self_person_id", chunk),
    ),
    readIn(ids, (chunk) =>
      admin
        .from("invites")
        .select("person_id")
        .in("person_id", chunk)
        .eq("status", "active")
        .is("archived_at", null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
    ),
  ]);
  const claimed = new Set(claims.map((c) => c.person_id));
  const ownEntries = new Set(
    owners.flatMap((o) => (o.self_person_id ? [o.self_person_id] : [])),
  );
  const invitedFor = new Set(live.flatMap((i) => (i.person_id ? [i.person_id] : [])));

  return {
    claimable: candidates.filter(
      (p) => isInvitable(p, claimed, ownEntries) && !invitedFor.has(p.id),
    ).length,
    people_added: added.length,
    invited:
      (invites.data ?? []).length > 0 ||
      (joined.data ?? []).length > 0 ||
      (answered.data ?? []).length > 0,
    shared: (stories.data ?? []).length > 0 || (photos.data ?? []).length > 0,
  };
}
