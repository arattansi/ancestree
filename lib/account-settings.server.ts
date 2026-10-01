import "server-only";

import type { SoleRootTree } from "@/components/delete-account";
import type { PendingRelay } from "@/components/relay-invites";
import { accountTypeOf, branchSideLabel } from "@/lib/account-types";
import type { Profile } from "@/lib/auth";
import { branchSidesOn } from "@/lib/branch.server";
import { listNotifications } from "@/lib/claims";
import { relayLapseCutoff } from "@/lib/invite-relays";
import { openedRelayNote } from "@/lib/opened-relay";
import { loadOpenedRelay } from "@/lib/opened-relay.server";
import { listPlacementAsks } from "@/lib/placements.server";
import { listRelayCandidates } from "@/lib/relay-candidates.server";
import { createClient } from "@/lib/supabase/server";
import type { MyTree } from "@/lib/tree-context";

/**
 * What the account page's settings view shows (Step 77.6, moved out of
 * `app/account/page.tsx`): relatives' asks and the entries they match, the
 * member's own entry across their trees, what each Branch membership
 * tends, the trees they'd leave without a Root, what other trees have asked
 * of them, their inbox and whether they get the weekly newsletter.
 * Everything that needs only them, their trees or the address is asked for
 * at once; what needs an answer first starts as soon as it has it (Step
 * 77.1).
 */
export async function loadAccountSettings(
  profile: Profile,
  trees: MyTree[],
  /** The ask named by the email's button (`relayHref`), if that's how they came. */
  openedRelayId: string | null,
) {
  const supabase = await createClient();
  const selfId = profile.self_person_id;
  const runIds = trees.filter((t) => t.type.runsTree).map((t) => t.id);
  const relayRowsP = supabase
    .from("invite_relays")
    .select("id, first_name, last_name, email, created_at")
    .eq("recipient_user_id", profile.auth_user_id)
    .eq("status", "pending")
    .gt("created_at", relayLapseCutoff(new Date()))
    .order("created_at", { ascending: true })
    .then((res) => res.data ?? []);
  const [
    notifications,
    { data: directory },
    relayRows,
    { data: madeBranches },
    relayMatches,
    openedRelay,
    selfEntry,
    branchSideByTree,
    { data: otherMembers },
    asks,
    { data: newsletter },
  ] = await Promise.all([
    listNotifications(profile.auth_user_id),
    supabase
      .from("member_directory")
      .select("tree_id, invited_by_name")
      .eq("auth_user_id", profile.auth_user_id),
    // Asks passed on to them from request access (Step 30.5): RLS shows
    // each only to the member it went to. One left for 30 days has lapsed
    // (Step 41.5).
    relayRowsP,
    // The Branches they've made, tree by tree: each Root makes up to four
    // (Step 39).
    supabase
      .from("tree_members")
      .select("tree_id")
      .eq("branch_granted_by", profile.auth_user_id),
    // The entries each ask's name matches on each of their trees, which they
    // may invite the newcomer to claim instead (Step 41.1).
    relayRowsP.then((rows) =>
      listRelayCandidates(
        rows.map((r) => r.id),
        trees.map((t) => t.id),
      ),
    ),
    // The ask the email's button named, in case it has been answered or
    // has lapsed since.
    openedRelayId ? loadOpenedRelay(openedRelayId) : null,
    // The member's own entry across trees: where it lives, where it shows.
    selfId
      ? Promise.all([
          supabase
            .from("people")
            .select("tree_id, hidden_from_visitors")
            .eq("id", selfId)
            .maybeSingle(),
          supabase
            .from("tree_placements")
            .select("tree_id, trees(name)")
            .eq("person_id", selfId)
            .eq("status", "active"),
        ])
      : null,
    // What each Branch membership tends: the Root they're related to there.
    Promise.all(
      selfId
        ? trees
            .filter((t) => t.type.entries === "branch")
            .map(async (t): Promise<[string, string | null]> => {
              const sideOf = await branchSidesOn(t.id);
              return [t.id, branchSideLabel(sideOf(selfId))];
            })
        : [],
    ).then((sides) => new Map(sides)),
    // The other members of every tree they run, for the Roots among them.
    runIds.length > 0
      ? supabase
          .from("member_directory")
          .select("tree_id, auth_user_id, display_name, role")
          .in("tree_id", runIds)
          .neq("auth_user_id", profile.auth_user_id)
      : { data: [] },
    // What other trees have asked to show in full (Step 80): their own
    // entry, and nobody's own entries they may edit.
    listPlacementAsks(),
    // Whether they get the weekly newsletter (Step 95): RLS shows only
    // their own row, and no row yet means on.
    supabase
      .from("newsletter_settings")
      .select("subscribed")
      .eq("user_id", profile.auth_user_id)
      .maybeSingle(),
  ]);
  const invitedByTree = new Map(
    (directory ?? []).map((d) => [d.tree_id, d.invited_by_name]),
  );
  const branchesMadeByTree = new Map<string, number>();
  for (const { tree_id } of madeBranches ?? []) {
    branchesMadeByTree.set(tree_id, (branchesMadeByTree.get(tree_id) ?? 0) + 1);
  }
  const relays: PendingRelay[] = relayRows.map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    createdAt: r.created_at,
    matches: relayMatches.get(r.id) ?? {},
  }));
  // Opened from the email after it was answered or lapsed (or signed in as
  // someone else): say so, rather than show nothing.
  const openedRelayGone =
    openedRelayId !== null && !relays.some((r) => r.id === openedRelayId);
  // Sending or dismissing it from its card refreshes this same address, so
  // an ask of theirs says what they did with it, never that it was answered
  // already (Step 41.1).
  const openedRelayLine =
    openedRelayGone && openedRelayId ? openedRelayNote(openedRelay) : null;

  let home: { id: string; name: string } | null = null;
  let shownOn: { id: string; name: string }[] = [];
  let hidden = false;
  if (selfEntry) {
    const [{ data: self }, { data: placements }] = selfEntry;
    hidden = self?.hidden_from_visitors ?? false;
    shownOn = (placements ?? []).flatMap((p) => {
      const t = Array.isArray(p.trees) ? p.trees[0] : p.trees;
      return t?.name ? [{ id: p.tree_id, name: t.name }] : [];
    });
    home = shownOn.find((t) => t.id === self?.tree_id) ?? null;
  }

  // Every tree they are the only Root of needs a successor before they go.
  const soleRootTrees: SoleRootTree[] = [];
  for (const t of trees) {
    if (!t.type.runsTree) continue;
    const others = (otherMembers ?? []).filter(
      (m): m is typeof m & { auth_user_id: string } =>
        m.tree_id === t.id && !!m.auth_user_id,
    );
    if (others.some((m) => m.role === "admin")) continue;
    soleRootTrees.push({
      treeId: t.id,
      treeName: t.name,
      successors: others
        .map((m) => ({
          userId: m.auth_user_id,
          name: `${m.display_name ?? "Unnamed member"} (${accountTypeOf(m.role).name})`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  return {
    notifications,
    invitedByTree,
    branchesMadeByTree,
    relays,
    openedRelayGone,
    openedRelayLine,
    home,
    shownOn,
    hidden,
    branchSideByTree,
    soleRootTrees,
    asks,
    newsletterOn: newsletter?.subscribed ?? true,
  };
}
