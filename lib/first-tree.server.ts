import "server-only";

import {
  closeFamilyOf,
  gettingStartedItems,
  type CloseFamily,
  type CloseKind,
  type FamilyCard,
  type FirstTreeState,
  type GettingStartedItem,
  type TreeInvite,
} from "@/lib/first-tree";
import {
  personDisplayName,
  personInitials,
  personLifespan,
} from "@/lib/person-name";
import {
  listForeignPlacements,
  listPlacementCandidates,
  type PlacementCandidate,
} from "@/lib/placements.server";
import { createClient } from "@/lib/supabase/server";
import { getTreeGraph, type TreeGraphEdge, type TreeGraphPerson } from "@/lib/tree";
import { listMyTrees, type TreeMembership } from "@/lib/tree-context";
import { isDefaultTreeName } from "@/lib/tree-names";

/**
 * Whether the member founded the tree they're on: its first Root, who gets
 * the first-run steps and the canvas's "Getting started" list (Step 29).
 */
export function isFounder(m: TreeMembership): boolean {
  return m.tree.created_by === m.profile.auth_user_id;
}

/** The founder's own entry, wherever its home is. */
export type FounderEntry = FamilyCard & {
  firstName: string;
  lastName: string;
  maidenName: string | null;
  /** The tree whose rules govern it — for a member, the one they came from. */
  homeTreeName: string | null;
  placedHere: boolean;
};

/** A close relative on the founder's other trees, not on this one yet. */
export type BringCandidate = PlacementCandidate & { kind: CloseKind };

export type FirstTreeData = {
  state: FirstTreeState;
  founder: FounderEntry | null;
  family: {
    parents: FamilyCard[];
    partners: (FamilyCard & { isDivorced: boolean })[];
    children: FamilyCard[];
    siblings: FamilyCard[];
  };
  /** Close relatives the founder could bring over from their other trees. */
  bring: BringCandidate[];
  /** Brought over, but waiting for the person to say yes. */
  waiting: { personId: string; name: string }[];
  /** Invitations out from this tree (not founder invites). */
  invites: TreeInvite[];
  /** The names of the founder's other trees, which this one shouldn't share. */
  otherTreeNames: string[];
};


function card(p: TreeGraphPerson): FamilyCard {
  return {
    id: p.id,
    name: personDisplayName(p),
    lifespan: personLifespan(p),
    initials: personInitials(p),
    photoUrl: p.photo_url,
  };
}

const NO_FAMILY: CloseFamily = { parents: [], partners: [], children: [], siblings: [] };

function stateOf(
  m: TreeMembership,
  selfPlaced: boolean,
  close: CloseFamily,
  invited: boolean,
): FirstTreeState {
  return {
    selfPlaced,
    defaultName: isDefaultTreeName(m.tree.name),
    invited,
    parents: close.parents.length,
    partners: close.partners.length,
    children: close.children.length,
    siblings: close.siblings.length,
  };
}

/**
 * Who's been invited onto this tree and hasn't joined yet — by name and
 * address from the invite step, or to claim an entry from the family step —
 * and whether anyone has been invited or has joined at all. Redeemed invites
 * are deleted (Step 24), so a joined member counts through the member count.
 */
async function treeInvites(treeId: string): Promise<{
  invited: boolean;
  invites: TreeInvite[];
}> {
  const supabase = await createClient();
  const [trees, { data }] = await Promise.all([
    listMyTrees(),
    supabase
      .from("invites")
      .select(
        "id, invited_email, invite_requests(first_name, last_name, email_sent), people(first_name, preferred_name, last_name)",
      )
      .eq("tree_id", treeId)
      .eq("founds_tree", false)
      .eq("status", "active")
      .is("archived_at", null)
      .not("invited_email", "is", null)
      .order("created_at", { ascending: true }),
  ]);

  const invites = (data ?? []).flatMap((row): TreeInvite[] => {
    const request = Array.isArray(row.invite_requests)
      ? row.invite_requests[0]
      : row.invite_requests;
    const entry = Array.isArray(row.people) ? row.people[0] : row.people;
    const claims = entry ? personDisplayName(entry) : null;
    const name = request
      ? `${request.first_name} ${request.last_name}`.trim()
      : (claims ?? "");
    if (!row.invited_email) return [];
    return [
      {
        id: row.id,
        name: name || row.invited_email,
        email: row.invited_email,
        claims,
        emailSent: request ? request.email_sent : null,
      },
    ];
  });
  const members = trees.find((t) => t.id === treeId)?.memberCount ?? 1;
  return { invited: members > 1 || invites.length > 0, invites };
}

/**
 * Everything the founder's first run reads, for the tree they're on. The
 * tree is new and small, so the whole graph is read to find their family.
 */
export async function loadFirstTree(m: TreeMembership): Promise<FirstTreeData> {
  const selfId = m.profile.self_person_id;
  const supabase = await createClient();

  const [{ people, relationships }, invited, myTrees, selfRow] = await Promise.all([
    getTreeGraph(m.tree.id),
    treeInvites(m.tree.id),
    listMyTrees(),
    selfId
      ? supabase
          .from("people")
          .select(
            "id, first_name, preferred_name, last_name, maiden_name, date_of_birth, date_of_death, is_deceased, tree_id, trees(name)",
          )
          .eq("id", selfId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const byId = new Map(people.map((p) => [p.id, p]));
  const placedHere = !!selfId && byId.has(selfId);
  const close = placedHere && selfId ? closeFamilyOf(selfId, relationships) : NO_FAMILY;
  const cards = (ids: string[]) =>
    ids.flatMap((id) => {
      const p = byId.get(id);
      return p ? [card(p)] : [];
    });

  let founder: FounderEntry | null = null;
  const row = selfRow.data;
  if (row) {
    const home = Array.isArray(row.trees) ? row.trees[0] : row.trees;
    const onTree = selfId ? byId.get(selfId) : undefined;
    founder = {
      id: row.id,
      name: personDisplayName(row),
      lifespan: personLifespan(row),
      initials: personInitials(row),
      photoUrl: onTree?.photo_url ?? null,
      firstName: (row.preferred_name || row.first_name || "").trim(),
      lastName: row.last_name.trim(),
      maidenName: row.maiden_name?.trim() || null,
      homeTreeName: home?.name ?? null,
      placedHere,
    };
  }

  // A member who founded this tree has family on the trees they came from:
  // offer to bring the close ones rather than add them twice.
  let bring: BringCandidate[] = [];
  let waiting: FirstTreeData["waiting"] = [];
  if (selfId && founder && row?.tree_id !== m.tree.id) {
    const [candidates, placed] = await Promise.all([
      closeRelativesElsewhere(m.tree.id, selfId),
      listForeignPlacements(m.tree.id),
    ]);
    bring = candidates;
    waiting = placed
      .filter((p) => p.status === "pending")
      .map((p) => ({ personId: p.personId, name: p.name }));
  }

  return {
    state: stateOf(m, placedHere, close, invited.invited),
    founder,
    family: {
      parents: cards(close.parents),
      partners: close.partners.flatMap((partner) => {
        const p = byId.get(partner.id);
        return p ? [{ ...card(p), isDivorced: partner.isDivorced }] : [];
      }),
      children: cards(close.children),
      siblings: cards(close.siblings),
    },
    bring,
    waiting,
    invites: invited.invites,
    otherTreeNames: myTrees.filter((t) => t.id !== m.tree.id).map((t) => t.name),
  };
}

/**
 * The founder's parents, partners, children and siblings on the other trees
 * they're on, who aren't on this one yet — what the family step offers to
 * bring over. Everyone else they can see stays on the admin console's
 * "People from other trees" card.
 */
async function closeRelativesElsewhere(
  treeId: string,
  selfId: string,
): Promise<BringCandidate[]> {
  const supabase = await createClient();
  const [{ data: lines }, candidates] = await Promise.all([
    supabase
      .from("tree_edges")
      .select("from_person, to_person, type, is_divorced, tree_id")
      .neq("tree_id", treeId),
    listPlacementCandidates(treeId),
  ]);

  const edges = (lines ?? []).flatMap((l) =>
    l.from_person && l.to_person && l.type
      ? [
          {
            from_person: l.from_person,
            to_person: l.to_person,
            type: l.type,
            is_divorced: l.is_divorced,
          },
        ]
      : [],
  );
  const close = closeFamilyOf(selfId, edges);
  const kindOf = new Map<string, CloseKind>();
  for (const id of close.parents) kindOf.set(id, "parent");
  for (const p of close.partners) kindOf.set(p.id, "partner");
  for (const id of close.children) kindOf.set(id, "child");
  for (const id of close.siblings) if (!kindOf.has(id)) kindOf.set(id, "sibling");

  const order: CloseKind[] = ["partner", "child", "parent", "sibling"];
  return candidates
    .flatMap((c) => {
      const kind = kindOf.get(c.id);
      return kind ? [{ ...c, kind }] : [];
    })
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

/**
 * The canvas's "Getting started" list for the founder, from the graph the
 * canvas already read; `null` for anyone else, or once it's all done.
 */
export async function getGettingStarted(
  m: TreeMembership,
  relationships: readonly TreeGraphEdge[],
): Promise<GettingStartedItem[] | null> {
  if (!isFounder(m) || !m.profile.self_person_id) return null;
  const close = closeFamilyOf(m.profile.self_person_id, relationships);
  const { invited } = await treeInvites(m.tree.id);
  const items = gettingStartedItems(stateOf(m, true, close, invited));
  return items.every((i) => i.done) ? null : items;
}

export type { FamilyCard, FirstTreeState, GettingStartedItem };
