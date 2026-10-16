import "server-only";

import {
  entriesNamed,
  inviteMatchOf,
  needsAsking,
  type InviteMatch,
  type MatchAnswer,
} from "@/lib/invite-matches";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cardOf, loadTreePeople } from "@/lib/tree";

/** A plain invite's row whose name is someone on the tree (Step 162). */
export type InviteQuestion = { email: string; entry: InviteMatch };

type NamedRow = {
  firstName: string;
  lastName: string;
  /** Checked and lower-cased: how the question finds its row. */
  email: string;
  match?: MatchAnswer | null;
};

/**
 * The rows of a plain invite to `treeId` whose first and last name are
 * exactly one entry's there that the inviter could invite them to claim
 * instead (Step 162), not yet answered: living, nobody behind it, theirs
 * to hand over (`can_invite_to_claim_on`, asked as the inviter, which
 * also covers the claim and whose own it is), and with no live invite to
 * claim it out already. Two entries by the same name ask nothing: the
 * plain invite goes.
 */
export async function inviteQuestions(
  treeId: string,
  rows: readonly NamedRow[],
): Promise<InviteQuestion[]> {
  const asked = rows.filter((r) => !r.match?.isThem);
  if (asked.length === 0) return [];
  const cards = (await loadTreePeople(treeId)).flatMap((p) => cardOf(p, treeId) ?? []);
  const named = new Map(asked.map((r) => [r.email, entriesNamed(cards, r.firstName, r.lastName)]));
  const ids = [...new Set([...named.values()].flat().map((c) => c.id))];
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const now = new Date().toISOString();
  const [mayInvite, { data: live }] = await Promise.all([
    Promise.all(
      ids.map((id) =>
        supabase
          .rpc("can_invite_to_claim_on", { p_tree: treeId, p_person_id: id })
          .then(({ data }) => data === true),
      ),
    ),
    // Any tree's: someone has been asked to take it over already. The
    // service role reads it, as RLS shows an invite only to a Root or its
    // sender, and only whether there is one leaves here.
    createAdminClient()
      .from("invites")
      .select("person_id")
      .in("person_id", ids)
      .eq("status", "active")
      .eq("founds_tree", false)
      .is("archived_at", null)
      .or(`expires_at.is.null,expires_at.gt.${now}`),
  ]);
  const invited = new Set((live ?? []).flatMap((i) => (i.person_id ? [i.person_id] : [])));
  const open = new Set(ids.filter((id, i) => mayInvite[i] && !invited.has(id)));

  return asked.flatMap((r) => {
    const found = (named.get(r.email) ?? []).filter((c) => open.has(c.id));
    const match = found.length === 1 ? inviteMatchOf(found[0]) : null;
    return match && needsAsking(match, r.match) ? [{ email: r.email, entry: match }] : [];
  });
}
