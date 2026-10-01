import "server-only";

import { cache } from "react";

import type { AccountTypeKey } from "@/lib/account-types";
import { getProfile } from "@/lib/auth";
import {
  familyTies,
  mergeLines,
  mergeShowings,
  treeMarkOf,
  type FamilyLine,
  type FamilyTie,
  type Showing,
  type TreeMark,
} from "@/lib/my-family";
import { reachOnTree, type TreeReach } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
import {
  cardOf,
  finishCards,
  lineOf,
  readApprovedClaims,
  readHistoricalNames,
  readIn,
  readPaged,
  readTreesEdges,
  readTreesPeople,
  type DirectoryRow,
  type TreeCard,
  type TreeGraphPerson,
} from "@/lib/tree";
import { listMyTrees } from "@/lib/tree-context";

/** One of the viewer's trees, as My Family Tree's key shows it. */
export type MyFamilyTree = {
  id: string;
  name: string;
  slug: string;
  /** The viewer's account type there. */
  role: AccountTypeKey;
  /** Its mark on the cards and the key: stable while they stay on it. */
  mark: TreeMark;
  /** What their account type reaches there, of the view's people: what
   *  the sheet offers from a card of this tree (Step 92.3). */
  reach: TreeReach;
};

/** Someone on My Family Tree: one card, whichever trees show them. */
export type MyFamilyPerson = TreeGraphPerson & {
  tie: FamilyTie;
  /** The tree the card comes from, whose mark it wears: their home tree if
   *  the viewer is on it, else the viewer's tree that has shown them in full
   *  longest, else one showing their basic card. */
  tree_id: string;
  /** Every one of the viewer's trees that shows them, in the key's order. */
  tree_ids: string[];
  /** Those of them that show them in full (Step 92.3). */
  full_tree_ids: string[];
};

export type MyFamilyGraph = {
  /** The viewer's own entry, which the view is arranged around. */
  selfId: string;
  /** The viewer's trees, in the order they joined: the key's order. */
  trees: MyFamilyTree[];
  people: MyFamilyPerson[];
  /** Only lines one of the viewer's trees draws. */
  relationships: FamilyLine[];
  /**
   * Of the view's people, the entries that belong to the people they
   * describe: other members' own and settled claims, which a Branch edits
   * around (`getSpokenForEntryIds`, for every tree at once).
   */
  spokenForIds: string[];
};

/** When each of `treeIds` placed each of its people, by `tree:person`. */
async function readPlacedAt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  treeIds: readonly string[],
) {
  const { rows, failed } = await readPaged((from, to) =>
    supabase
      .from("tree_placements")
      .select("tree_id, person_id, created_at")
      .in("tree_id", treeIds)
      .eq("status", "active")
      .order("id")
      .range(from, to),
  );
  return {
    placedAt: new Map(
      rows.map((p) => [`${p.tree_id}:${p.person_id}`, p.created_at]),
    ),
    failed,
  };
}

/** Each of `treeIds`' members as its directory lists them, by tree. */
async function readDirectories(
  supabase: Awaited<ReturnType<typeof createClient>>,
  treeIds: readonly string[],
): Promise<Map<string, DirectoryRow[]>> {
  const { data } = await supabase
    .from("member_directory")
    .select(
      "tree_id, auth_user_id, display_name, role, self_person_id, joined_at, invited_by_user_id, invited_by_name",
    )
    .in("tree_id", treeIds)
    .order("joined_at", { ascending: true });
  const byTree = new Map<string, DirectoryRow[]>();
  for (const { tree_id, ...m } of data ?? []) {
    if (!tree_id) continue;
    const list = byTree.get(tree_id);
    if (list) list.push(m);
    else byTree.set(tree_id, [m]);
  }
  return byTree;
}

/**
 * The signed-in member's My Family Tree (Step 92): everyone `familyTies`
 * names, gathered from every tree they're a **member** of (a tree they only
 * visit stays out), one card each. Read once per request.
 *
 * Every tree is read at once rather than tree by tree: one wave for the
 * people, lines, placement dates, period names and directories of all of
 * them, then one for the photos, places, claims and reports of whoever is
 * in — the same two waves one tree's canvas takes (`getTreeGraph`). RLS
 * bounds it as on each tree: a member already reads all of this there.
 *
 * `null` when there's nothing to arrange it around: no entry of their own,
 * no tree, or no tree of theirs that shows them.
 */
export const loadMyFamily = cache(async (): Promise<MyFamilyGraph | null> => {
  const [profile, myTrees] = await Promise.all([getProfile(), listMyTrees()]);
  const selfId = profile?.self_person_id;
  if (!selfId || myTrees.length === 0) return null;
  // In the order they joined, as the switcher lists them; two joined in the
  // same moment keep one order, so their marks don't swap between visits.
  const joined = [...myTrees].sort(
    (a, b) =>
      Date.parse(a.joinedAt) - Date.parse(b.joinedAt) ||
      a.id.localeCompare(b.id),
  );
  const treeIds = joined.map((t) => t.id);
  const mine = new Set(treeIds);

  const supabase = await createClient();
  const [people, edges, { placedAt, failed }, histRows, directories] =
    await Promise.all([
      readTreesPeople(supabase, treeIds),
      readTreesEdges(supabase, treeIds),
      readPlacedAt(supabase, treeIds),
      readHistoricalNames(supabase),
      readDirectories(supabase, treeIds),
    ]);
  // Half the lines would put people in the wrong family: say so instead.
  if (people.failed || edges.failed || failed) {
    throw new Error("Your trees couldn't be read.");
  }

  // Every tree's showing of everyone, as one card each. Blurred cards are
  // a visitor's (Step 25.4), never a member's, and say nothing anyway.
  const showings = people.rows.flatMap((p): Showing<TreeCard>[] => {
    const card = p.tree_id ? cardOf(p, p.tree_id) : null;
    if (!p.tree_id || !card || card.blurred) return [];
    return [
      {
        treeId: p.tree_id,
        row: card,
        basic: card.basic,
        isHome: card.is_home,
        placedAt: placedAt.get(`${p.tree_id}:${card.id}`) ?? null,
      },
    ];
  });
  const cards = mergeShowings(showings, treeIds);
  if (!cards.has(selfId)) return null;

  // Lines are facts across trees, so each tree's copy of one is the same
  // line: drawn here when drawn on any tree of theirs.
  const lines = mergeLines(
    edges.rows.flatMap((r) => {
      const line = r.tree_id ? lineOf(r, r.tree_id) : null;
      if (!line) return [];
      return [
        {
          ...line,
          drawn_here: !!r.drawn_on_tree_id && mine.has(r.drawn_on_tree_id),
          drawn_on_tree_id: r.drawn_on_tree_id,
        },
      ];
    }),
  );
  const ties = familyTies(selfId, lines);

  const shown = [...cards.values()].filter((c) => ties.has(c.row.id));
  const treeOf = new Map(shown.map((c) => [c.row.id, c.treeId]));
  // Always arranged around them: a tree's own card positions mean nothing
  // here, so none come along.
  const rows = shown.map((c) => ({
    ...c.row,
    pos_x: null,
    pos_y: null,
    pos_dx: null,
    pos_dy: null,
  }));
  const ids = rows.map((p) => p.id);
  // Whose own entry each is, beside the cards' finishing: members' own
  // entries are read as each tree's canvas reads them (Step 92.3).
  const [finished, owners] = await Promise.all([
    finishCards(supabase, rows, {
      histRows,
      claims: readApprovedClaims(supabase, ids),
      directories,
      treeOf: (id) => treeOf.get(id) ?? "",
    }),
    readIn(ids, (chunk) =>
      supabase
        .from("profiles")
        .select("auth_user_id, self_person_id")
        .in("self_person_id", chunk),
    ),
  ]);

  // Who they are on each tree, measured on that tree's own people and
  // lines, as its canvas would (`getViewer`), from the reads above.
  const shownIds = new Set(ids);
  const trees: MyFamilyTree[] = joined.map((t, i) => {
    const placed = new Set(
      people.rows.flatMap((p) => (p.tree_id === t.id && p.id ? [p.id] : [])),
    );
    const rootIds = (directories.get(t.id) ?? []).flatMap((m) =>
      m.role === "admin" && m.self_person_id && placed.has(m.self_person_id)
        ? [m.self_person_id]
        : [],
    );
    const treeEdges = edges.rows.flatMap((r) =>
      r.tree_id === t.id && r.from_person && r.to_person && r.type
        ? [{ from_person: r.from_person, to_person: r.to_person, type: r.type }]
        : [],
    );
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      role: t.role,
      mark: treeMarkOf(i),
      reach: reachOnTree(selfId, t.role, rootIds, treeEdges, shownIds),
    };
  });

  const spokenFor = new Set<string>();
  for (const o of owners) {
    if (o.self_person_id && o.auth_user_id !== profile?.auth_user_id) {
      spokenFor.add(o.self_person_id);
    }
  }
  for (const p of finished) {
    if (p.claim_status === "approved") spokenFor.add(p.id);
  }

  return {
    selfId,
    trees,
    people: finished.map((p) => ({
      ...p,
      tie: ties.get(p.id) ?? "partner",
      tree_id: treeOf.get(p.id) ?? "",
      tree_ids: cards.get(p.id)?.treeIds ?? [],
      full_tree_ids: cards.get(p.id)?.fullTreeIds ?? [],
    })),
    relationships: lines.filter(
      (l) => treeOf.has(l.from_person) && treeOf.has(l.to_person),
    ),
    spokenForIds: [...spokenFor],
  };
});
