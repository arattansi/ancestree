import "server-only";

import {
  byFamilyName,
  isInvitable,
} from "@/lib/invitable";
import { listClaimInvites } from "@/lib/claim-invites.server";
import type { EntryInvite } from "@/lib/claim-invites";
import { personDisplayName } from "@/lib/person-name";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cardOf, loadTreePeople, readApprovedClaims, readIn } from "@/lib/tree";

/** One row of the Root console's list. */
export type Invitable = {
  id: string;
  name: string;
  /** The year they were born, when the card shows it. */
  bornYear: number | null;
  /** The newest invite out for them, live or the last to lapse. */
  invite: EntryInvite | null;
};

/**
 * Everyone living on `treeId` that nobody is behind yet (Step 143), for
 * its Root console: surname first, each with the invite already out for
 * them, if any. Only for a Root of the tree — the caller has checked —
 * since whose own entry each one is, and every claim, are read with the
 * service role. A basic card (Step 80) shows no dates, so the database is
 * asked about each (`can_invite_to_claim_on`, as the Root).
 */
export async function listInvitable(
  treeId: string,
  rootUserId: string,
): Promise<Invitable[]> {
  const cards = (await loadTreePeople(treeId)).flatMap(
    (p) => cardOf(p, treeId) ?? [],
  );
  const full = cards.filter((c) => !c.basic && !c.blurred);
  const basic = cards.filter((c) => c.basic && c.placeholder_number == null);
  const ids = full.map((c) => c.id);
  const admin = createAdminClient();
  const supabase = await createClient();

  const [claims, owners, invites, basicOk] = await Promise.all([
    readApprovedClaims(admin, ids),
    readIn(ids, (chunk) =>
      admin.from("profiles").select("self_person_id").in("self_person_id", chunk),
    ),
    listClaimInvites(treeId, { userId: rootUserId, isRoot: true }),
    Promise.all(
      basic.map((c) =>
        supabase
          .rpc("can_invite_to_claim_on", { p_tree: treeId, p_person_id: c.id })
          .then(({ data }) => data === true),
      ),
    ),
  ]);
  const claimed = new Set(claims.map((c) => c.person_id));
  const ownEntries = new Set(
    owners.flatMap((o) => (o.self_person_id ? [o.self_person_id] : [])),
  );
  // Newest first already: the first per person is the one to show.
  const inviteOf = new Map<string, EntryInvite>();
  for (const i of invites) if (!inviteOf.has(i.personId)) inviteOf.set(i.personId, i);

  const shown = [
    ...full.filter((c) => isInvitable(c, claimed, ownEntries)),
    ...basic.filter((_, i) => basicOk[i]),
  ].sort(byFamilyName);
  return shown.map((c) => ({
    id: c.id,
    name: personDisplayName(c),
    bornYear: c.date_of_birth ? Number(c.date_of_birth.slice(0, 4)) : null,
    invite: inviteOf.get(c.id) ?? null,
  }));
}
