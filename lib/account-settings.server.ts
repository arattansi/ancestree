import "server-only";

import type { ViewerTreeOption } from "@/components/admin/admin-tree-settings";
import type { SoleRootTree } from "@/components/delete-account";
import type { PendingRelay } from "@/components/relay-invites";
import { accountTypeOf, branchSideLabel } from "@/lib/account-types";
import type { Profile } from "@/lib/auth";
import { branchSidesOn } from "@/lib/branch.server";
import { listNotifications } from "@/lib/claims";
import type { NicknameGroup } from "@/lib/nicknames";
import { listNicknameGroups } from "@/lib/nicknames.server";
import { relayLapseCutoff } from "@/lib/invite-relays";
import { openedRelayNote } from "@/lib/opened-relay";
import { loadOpenedRelay } from "@/lib/opened-relay.server";
import { listPlacementAsks } from "@/lib/placements.server";
import { listRelayCandidates } from "@/lib/relay-candidates.server";
import { createClient } from "@/lib/supabase/server";
import type { MyTree } from "@/lib/tree-context";

/** A tree, not its home, that shows the member's own card (Step 106). */
export type OwnCardElsewhere = {
  id: string;
  name: string;
  /** Only their name shows there. */
  nameOnly: boolean;
  /** They're a member of it: making it name only leaves it. */
  member: boolean;
  /** A Root of it, who can't leave it. */
  root: boolean;
  /** It's the only tree they're a member of. */
  onlyTree: boolean;
};

/**
 * What the account page's settings view shows (Step 77.6, moved out of
 * `app/account/page.tsx`): relatives' asks and the entries they match, the
 * member's own entry across their trees, what each Branch membership
 * tends, the trees they'd leave without a Root, what other trees have asked
 * of them, their inbox and whether they get the weekly newsletter; and,
 * for a Root, each tree they run's settings (Step 103.2, from the Root
 * console): who else may view it, and the nickname groups.
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
    { data: openTo },
    nicknameGroups,
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
            .select("tree_id, approval, trees(name)")
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
    // Which of their other trees may view each tree they run (Step 25.4).
    runIds.length > 0
      ? supabase
          .from("tree_visibility")
          .select("tree_id, viewer_tree_id")
          .in("tree_id", runIds)
      : { data: [] },
    // Shared by every tree, so one list for whoever runs any.
    runIds.length > 0 ? listNicknameGroups() : ([] as NicknameGroup[]),
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
  let elsewhere: OwnCardElsewhere[] = [];
  let hidden = false;
  if (selfEntry) {
    const [{ data: self }, { data: placements }] = selfEntry;
    hidden = self?.hidden_from_visitors ?? false;
    const shown = (placements ?? []).flatMap((p) => {
      const t = Array.isArray(p.trees) ? p.trees[0] : p.trees;
      return t?.name
        ? [{ id: p.tree_id, name: t.name, approval: p.approval }]
        : [];
    });
    shownOn = shown.map(({ id, name }) => ({ id, name }));
    home = shownOn.find((t) => t.id === self?.tree_id) ?? null;
    // Every other tree their card is on, and what it shows there (Step 106).
    const memberOf = new Map(trees.map((t) => [t.id, t]));
    elsewhere = shown
      .filter((t) => t.id !== self?.tree_id)
      .map((t) => {
        const membership = memberOf.get(t.id);
        return {
          id: t.id,
          name: t.name,
          nameOnly: t.approval === "shell",
          member: !!membership,
          root: !!membership?.type.runsTree,
          onlyTree: !!membership && trees.length === 1,
        };
      });
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

  // Each tree they run, with their other trees and whether each may view it.
  const viewersByTree = new Map<string, ViewerTreeOption[]>(
    runIds.map((id) => [
      id,
      trees
        .filter((t) => t.id !== id)
        .map((t) => ({
          id: t.id,
          name: t.name,
          visible: (openTo ?? []).some(
            (v) => v.tree_id === id && v.viewer_tree_id === t.id,
          ),
        })),
    ]),
  );

  return {
    notifications,
    invitedByTree,
    branchesMadeByTree,
    relays,
    openedRelayGone,
    openedRelayLine,
    home,
    shownOn,
    elsewhere,
    hidden,
    branchSideByTree,
    soleRootTrees,
    asks,
    newsletterOn: newsletter?.subscribed ?? true,
    viewersByTree,
    nicknameGroups,
  };
}
