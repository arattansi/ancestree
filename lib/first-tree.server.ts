import "server-only";

import {
  closeFamilyOf,
  gettingStartedItems,
  joinerItems,
  type CloseFamily,
  type CloseKind,
  type FamilyCard,
  type FamilyLine,
  type FirstTreeState,
  type GettingStartedItem,
  type TreeInvite,
} from "@/lib/first-tree";
import {
  personDisplayName,
  personInitials,
  personLifespan,
} from "@/lib/person-name";
import { BASIC_DETAILS, type CarryLine, type CarryPerson } from "@/lib/carry";
import {
  getFamilyLink,
  listFamilyLinkJoins,
  type FamilyLink,
  type FamilyLinkJoin,
} from "@/lib/family-link.server";
import { listPeopleYouAdded, type Invitable } from "@/lib/invitable.server";
import type { MyFamilyGraph } from "@/lib/my-family.server";
import { readStepSignals } from "@/lib/onboarding-signals.server";
import { listCarryChoices } from "@/lib/placements.server";
import { createClient } from "@/lib/supabase/server";
import {
  getTreeGraph,
  loadTreeEdges,
  loadTreePeople,
  type TreeGraphPerson,
} from "@/lib/tree";
import {
  currentAccess,
  listMyTrees,
  type MyTree,
  type TreeMembership,
} from "@/lib/tree-context";
import { foundingTreeName, isDefaultTreeName } from "@/lib/tree-names";

/**
 * Whether the member founded the tree they're on: its first Root, who gets
 * the first-run steps and the canvas's "Getting started" list (Step 29).
 */
export function isFounder(m: TreeMembership): boolean {
  return m.tree.created_by === m.profile.auth_user_id;
}

/**
 * Names a founder's tree after their family once their own entry is on it
 * (Step 168) — added on the family step, or brought across — while it still
 * has the default name it was planted with (`foundingTreeName`). The invite
 * step comes next, and its emails name the tree. Anyone else's add, or a
 * name someone chose, leaves it alone. Best effort: a tree left unnamed is
 * offered the name again on the last step. The new name, if it took.
 */
export async function nameFoundersTree(
  m: TreeMembership,
  selfId: string,
): Promise<string | null> {
  if (!isFounder(m) || !isDefaultTreeName(m.tree.name)) return null;
  const supabase = await createClient();
  const [{ data: self }, myTrees] = await Promise.all([
    supabase
      .from("people")
      .select("last_name, maiden_name")
      .eq("id", selfId)
      .maybeSingle(),
    listMyTrees(),
  ]);
  const name = foundingTreeName(
    m.tree.name,
    { maidenName: self?.maiden_name, lastName: self?.last_name },
    myTrees.filter((t) => t.id !== m.tree.id).map((t) => t.name),
  );
  if (!name) return null;
  const { error } = await supabase.rpc("rename_tree", {
    p_tree: m.tree.id,
    p_name: name,
  });
  return error ? null : name;
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

/**
 * Who the founder could bring from their other trees (Step 80): everyone
 * they can see there and the lines between them, for "All descendants of",
 * with their close family ticked to begin with.
 */
export type BringChoices = {
  people: CarryPerson[];
  lines: CarryLine[];
  /** Their partners, children, parents and siblings who aren't here yet. */
  close: string[];
  /** The trees they'd come from. */
  fromTrees: string[];
};

export type FirstTreeData = {
  state: FirstTreeState;
  founder: FounderEntry | null;
  family: {
    parents: FamilyCard[];
    partners: (FamilyCard & { isDivorced: boolean })[];
    children: FamilyCard[];
    /** `parentless`: no parent on the tree yet, so a parent added later is
     *  offered as theirs too (Step 125). */
    siblings: (FamilyCard & { parentless: boolean })[];
  };
  /** Who the founder could bring over from their other trees, if anyone. */
  bring: BringChoices | null;
  /** Invitations out from this tree (not founder invites). */
  invites: TreeInvite[];
  /** The names of the founder's other trees, which this one shouldn't share. */
  otherTreeNames: string[];
};


function card(p: TreeGraphPerson): FamilyCard {
  return {
    id: p.id,
    name: personDisplayName(p),
    // A basic card has no years to give, and the chip mustn't guess.
    lifespan: p.basic ? BASIC_DETAILS : personLifespan(p),
    initials: personInitials(p),
    photoUrl: p.photo_url,
  };
}

const NO_FAMILY: CloseFamily = { parents: [], partners: [], children: [], siblings: [] };

/** What the steps read of the founder's own entry: a card on the canvas's
 *  graph, or a row of the tree's people. */
type OwnEntryFacts = {
  id: string | null;
  photo_path: string | null;
  place_id_birth: number | null;
  city_of_birth: string | null;
  country_of_birth: string | null;
  /** A child's placeholder (Step 98.3): their details wait on a parent. */
  placeholder_number?: number | null;
};

function stateOf(
  m: TreeMembership,
  self: OwnEntryFacts | undefined,
  close: CloseFamily,
  invited: boolean,
): FirstTreeState {
  return {
    selfPlaced: !!self,
    selfPhoto: !!self?.photo_path,
    // A place picked, or an older free-text one, as `blankFields` judges it.
    selfBirthplace:
      !!self &&
      (self.place_id_birth != null ||
        !!self.city_of_birth?.trim() ||
        !!self.country_of_birth?.trim()),
    defaultName: isDefaultTreeName(m.tree.name),
    invited,
    parents: close.parents.length,
    partners: close.partners.length,
    children: close.children.length,
    siblings: close.siblings.length,
  };
}

/**
 * Who's been invited onto this tree by email and hasn't joined yet — by
 * name and address from the invite step, or to claim an entry — and
 * whether anyone has been invited or has joined at all: a link to claim
 * an entry or the family link counts too (Step 162), though neither names
 * anyone to list. Redeemed invites are deleted (Step 24), so a joined
 * member counts through the member count.
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
        "id, invited_email, person_id, invite_requests(first_name, last_name, email_sent), people(first_name, preferred_name, last_name)",
      )
      .eq("tree_id", treeId)
      .eq("founds_tree", false)
      .eq("status", "active")
      .is("archived_at", null)
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
        personId: row.person_id,
        emailSent: request ? request.email_sent : null,
      },
    ];
  });
  const members = trees.find((t) => t.id === treeId)?.memberCount ?? 1;
  return { invited: members > 1 || (data ?? []).length > 0, invites };
}

/**
 * Everything the founder's first run reads, for the tree they're on. The
 * tree is new and small, so the whole graph is read to find their family.
 * `withBring: false` leaves out who could be brought from their other
 * trees, for a visit that only needs to know which step to open (Step
 * 77.1): it's sent on to that step's address, which reads it all.
 */
export async function loadFirstTree(
  m: TreeMembership,
  { withBring = true }: { withBring?: boolean } = {},
): Promise<FirstTreeData> {
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
            "id, first_name, preferred_name, last_name, maiden_name, date_of_birth, date_of_death, date_of_birth_circa, date_of_death_circa, is_deceased, tree_id, trees(name)",
          )
          .eq("id", selfId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const byId = new Map(people.map((p) => [p.id, p]));
  const self = selfId ? byId.get(selfId) : undefined;
  const placedHere = !!self;
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
  // offer to bring them rather than add them twice, once they're here
  // themselves to bring them to.
  let bring: BringChoices | null = null;
  if (withBring && selfId && founder && placedHere && row?.tree_id !== m.tree.id) {
    bring = await bringChoices(m.tree.id, selfId);
  }

  return {
    state: stateOf(m, self, close, invited.invited),
    founder,
    family: {
      parents: cards(close.parents),
      partners: close.partners.flatMap((partner) => {
        const p = byId.get(partner.id);
        return p ? [{ ...card(p), isDivorced: partner.isDivorced }] : [];
      }),
      children: cards(close.children),
      siblings: cards(close.siblings).map((c) => ({
        ...c,
        parentless: !relationships.some(
          (r) => r.type === "parent" && r.to_person === c.id,
        ),
      })),
    },
    bring,
    invites: invited.invites,
    otherTreeNames: myTrees.filter((t) => t.id !== m.tree.id).map((t) => t.name),
  };
}

/** What the invite step shows beyond the invites already out (Step 162). */
export type InviteStepData = {
  /** The living people the founder added here that nobody is behind yet. */
  added: Invitable[];
  /** The tree's family link, for a Root: `link` is null before one is made. */
  familyLink: { link: FamilyLink | null; joins: FamilyLinkJoin[] } | null;
};

/**
 * The invite step's lists (Step 162): the people the founder added on the
 * family step, each to invite by email or a link (`listPeopleYouAdded`, as
 * settings lists them), and for a Root the family link (Step 52).
 */
export async function loadInviteStep(m: TreeMembership): Promise<InviteStepData> {
  const link = m.isRoot ? getFamilyLink(m.tree.id) : null;
  const [added, familyLink] = await Promise.all([
    listPeopleYouAdded(m.profile.auth_user_id, m.profile.self_person_id, [
      { id: m.tree.id, name: m.tree.name, type: m.type },
    ]),
    link
      ? link.then(async (l) => ({
          link: l,
          joins: await listFamilyLinkJoins(m.tree.id, l?.id ?? null),
        }))
      : null,
  ]);
  return { added: added[0]?.people ?? [], familyLink };
}

/**
 * Everyone the founder can see on their other trees who could come onto
 * this one, their close family first in mind: partners, children, parents
 * and siblings not here yet are ticked to begin with. `null` when there is
 * nobody to bring.
 */
async function bringChoices(
  treeId: string,
  selfId: string,
): Promise<BringChoices | null> {
  const { people, lines } = await listCarryChoices(treeId);
  const toBring = people.filter((p) => !p.here);
  if (toBring.length === 0) return null;

  const close = closeFamilyOf(selfId, lines);
  const kindOf = new Map<string, CloseKind>();
  for (const id of close.parents) kindOf.set(id, "parent");
  for (const p of close.partners) kindOf.set(p.id, "partner");
  for (const id of close.children) kindOf.set(id, "child");
  for (const id of close.siblings) if (!kindOf.has(id)) kindOf.set(id, "sibling");

  const order: CloseKind[] = ["partner", "child", "parent", "sibling"];
  return {
    people,
    lines,
    close: toBring
      .flatMap((p) => {
        const kind = kindOf.get(p.id);
        return kind ? [{ id: p.id, kind }] : [];
      })
      .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
      .map((p) => p.id),
    fromTrees: [...new Set(toBring.flatMap((p) => p.fromTrees))],
  };
}

/**
 * The canvas's "Getting started" list for the founder, from the graph the
 * canvas reads; `null` for anyone else, or once it's all done. The graph
 * can still be on its way: the invites are read beside it (Step 77.1).
 */
export async function getGettingStarted(
  m: TreeMembership,
  graph: PromiseLike<{
    people: readonly OwnEntryFacts[];
    relationships: readonly FamilyLine[];
  }>,
): Promise<GettingStartedItem[] | null> {
  const selfId = m.profile.self_person_id;
  if (!isFounder(m) || !selfId) return null;
  const [{ people, relationships }, { invited }] = await Promise.all([
    graph,
    treeInvites(m.tree.id),
  ]);
  const self = people.find((p) => p.id === selfId);
  // The canvas sends anyone not on it to onboarding first.
  if (!self) return null;
  const close = closeFamilyOf(selfId, relationships);
  const items = gettingStartedItems(stateOf(m, self, close, invited));
  return items.every((i) => i.done) ? null : items;
}

/**
 * The canvas's "Getting started" list for a member who joined someone
 * else's tree (Step 170), on the tree they're looking at, from the people
 * and lines the canvas reads; `null` for its founder (`getGettingStarted`),
 * for anyone not on it, or once it's all done. What they've done is read
 * as the getting started emails read it (`readStepSignals`), beside the
 * graph.
 */
export async function getJoinerGettingStarted(
  m: TreeMembership,
  graph: PromiseLike<{
    people: readonly OwnEntryFacts[];
    relationships: readonly FamilyLine[];
  }>,
): Promise<GettingStartedItem[] | null> {
  const selfId = m.profile.self_person_id;
  if (isFounder(m) || !selfId) return null;
  const [{ people, relationships }, signals] = await Promise.all([
    graph,
    listMyTrees().then((trees) =>
      readStepSignals(
        m.profile.auth_user_id,
        selfId,
        trees.map((t) => t.id),
      ),
    ),
  ]);
  const self = people.find((p) => p.id === selfId);
  // A child on their own placeholder has nothing to fill in yet.
  if (!self || self.placeholder_number != null || !signals) return null;
  const close = closeFamilyOf(selfId, relationships);
  const { selfPhoto, selfBirthplace } = stateOf(m, self, close, false);
  const items = joinerItems({
    treeId: m.tree.id,
    runsTree: m.type.runsTree,
    selfId,
    selfPhoto,
    selfBirthplace,
    partners: close.partners.length,
    children: close.children.length,
    signals,
  });
  return items.every((i) => i.done) ? null : items;
}

/**
 * The canvas's "Getting started" list on a tree, whoever's looking: the
 * founder's first run (Step 29), or a joiner's next steps (Step 170).
 */
export function getCanvasGettingStarted(
  m: TreeMembership,
  graph: PromiseLike<{
    people: readonly OwnEntryFacts[];
    relationships: readonly FamilyLine[];
  }>,
): Promise<GettingStartedItem[] | null> {
  return isFounder(m)
    ? getGettingStarted(m, graph)
    : getJoinerGettingStarted(m, graph);
}

/**
 * The tree the pages fall back to, when the member founded it (Step 169):
 * My Family Tree shows the card at the end of its first run. `null` for
 * anyone who founded no tree, or is looking at another.
 */
export async function foundedCurrentTree(
  trees: readonly MyTree[],
): Promise<TreeMembership | null> {
  if (!trees.some((t) => t.founded)) return null;
  const access = await currentAccess();
  return access?.kind === "member" && isFounder(access.membership)
    ? access.membership
    : null;
}

/**
 * The "Getting started" list on My Family Tree, for the tree the pages fall
 * back to: its founder's (Step 169), off the tree's own rows, or a
 * joiner's (Step 170), off the view's own graph (`loadMyFamily`), with
 * their entry counted only if that tree shows it. Either way no photo is
 * signed for it: the view draws other people, and the canvas's whole graph
 * would be read for a handful of ticks.
 */
export async function getFamilyGettingStarted(
  family: PromiseLike<MyFamilyGraph | null>,
): Promise<{ treeId: string; items: GettingStartedItem[] } | null> {
  const access = await currentAccess();
  if (access?.kind !== "member") return null;
  const m = access.membership;
  const items = isFounder(m)
    ? await getGettingStarted(m, treeRows(m.tree.id))
    : await getJoinerGettingStarted(
        m,
        Promise.resolve(family).then((f) => ({
          people: (f?.people ?? []).filter((p) => p.tree_ids.includes(m.tree.id)),
          relationships: f?.relationships ?? [],
        })),
      );
  return items ? { treeId: m.tree.id, items } : null;
}

/** A tree's own people and lines, as the steps read them. */
function treeRows(treeId: string) {
  return Promise.all([loadTreePeople(treeId), loadTreeEdges(treeId)]).then(
    ([people, { edges }]) => ({
      people,
      relationships: edges.flatMap((e): FamilyLine[] =>
        e.from_person && e.to_person && e.type
          ? [
              {
                from_person: e.from_person,
                to_person: e.to_person,
                type: e.type,
                is_divorced: e.is_divorced,
              },
            ]
          : [],
      ),
    }),
  );
}
