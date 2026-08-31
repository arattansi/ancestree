/**
 * Pure, client-safe auto-layout for the family-tree canvas.
 *
 * Parent edges are stored `parent -> child`; spouses as an undirected pair.
 * dagre lays the graph out top-down by generation. To keep partners on the
 * same rank and hang their children from a shared point, we insert a tiny
 * invisible "union" node between a couple (or a single parent) and its
 * children; the union nodes exist for layout only and are never rendered.
 */
import dagre from "dagre";

export const NODE_W = 208;
export const NODE_H = 96;

export type LayoutPerson = {
  id: string;
  pos_x: number | null;
  pos_y: number | null;
  /** `YYYY-MM-DD`; used to order couples / siblings left→right, eldest first. */
  date_of_birth?: string | null;
};

export type LayoutRelationship = {
  from_person: string;
  to_person: string;
  type: string;
};

export type XY = { x: number; y: number };

class UnionFind {
  private parent = new Map<string, string>();
  find(a: string): string {
    let p = this.parent.get(a);
    if (p === undefined) {
      this.parent.set(a, a);
      return a;
    }
    while (p !== this.parent.get(p)!) p = this.parent.get(p)!;
    this.parent.set(a, p);
    return p;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const coupleKey = (ids: string[]) => `couple:${[...ids].sort().join("+")}`;
const parentSetKey = (ids: string[]) => `parents:${[...ids].sort().join("+")}`;

/**
 * Returns a map of `personId -> top-left canvas position`. People with a
 * pinned `pos_x` / `pos_y` keep that position; everyone else is auto-placed.
 */
export function layoutTree(
  people: LayoutPerson[],
  relationships: LayoutRelationship[],
): Map<string, XY> {
  const ids = new Set(people.map((p) => p.id));
  const parentEdges = relationships.filter(
    (r) => r.type === "parent" && ids.has(r.from_person) && ids.has(r.to_person),
  );
  const spouseEdges = relationships.filter(
    (r) => r.type === "spouse" && ids.has(r.from_person) && ids.has(r.to_person),
  );

  // Couples: connected components over spouse edges.
  const uf = new UnionFind();
  for (const p of people) uf.find(p.id);
  for (const e of spouseEdges) uf.union(e.from_person, e.to_person);
  const coupleMembers = new Map<string, string[]>();
  for (const p of people) {
    const root = uf.find(p.id);
    const list = coupleMembers.get(root) ?? [];
    list.push(p.id);
    coupleMembers.set(root, list);
  }

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: "TB", nodesep: 44, ranksep: 96, marginx: 48, marginy: 48 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const p of people) g.setNode(p.id, { width: NODE_W, height: NODE_H });

  // A union node per couple of 2+ people, tying partners to one rank.
  const coupleUnionKey = new Map<string, string>();
  for (const [root, members] of coupleMembers) {
    if (members.length < 2) continue;
    const key = coupleKey(members);
    coupleUnionKey.set(root, key);
    g.setNode(key, { width: 1, height: 1 });
    for (const m of members) g.setEdge(m, key, { minlen: 1, weight: 4 }, "couple");
  }

  // Parents of each child, then a union node per distinct parent set.
  const parentsByChild = new Map<string, string[]>();
  for (const e of parentEdges) {
    const list = parentsByChild.get(e.to_person) ?? [];
    if (!list.includes(e.from_person)) list.push(e.from_person);
    parentsByChild.set(e.to_person, list);
  }

  for (const [child, parents] of parentsByChild) {
    let unionId: string;
    const root = uf.find(parents[0]);
    const sameCouple =
      parents.length >= 2 &&
      parents.every((p) => uf.find(p) === root) &&
      (coupleMembers.get(root) ?? []).length === parents.length;

    if (sameCouple && coupleUnionKey.has(root)) {
      unionId = coupleUnionKey.get(root)!;
    } else {
      unionId = parentSetKey(parents);
      if (!g.hasNode(unionId)) {
        g.setNode(unionId, { width: 1, height: 1 });
        for (const p of parents)
          g.setEdge(p, unionId, { minlen: 1, weight: 2 }, "parents");
      }
    }
    g.setEdge(unionId, child, { minlen: 1, weight: 3 }, "child");
  }

  dagre.layout(g);

  // Raw auto positions (top-left) straight from dagre.
  const auto = new Map<string, XY>();
  for (const p of people) {
    const node = g.node(p.id);
    auto.set(
      p.id,
      node
        ? { x: node.x - NODE_W / 2, y: node.y - NODE_H / 2 }
        : { x: 0, y: 0 },
    );
  }

  orderLateralByDob(auto, people, parentEdges, spouseEdges);

  const positions = new Map<string, XY>();
  for (const p of people) {
    const pinned =
      p.pos_x !== null && p.pos_y !== null
        ? { x: p.pos_x, y: p.pos_y }
        : null;
    positions.set(p.id, pinned ?? auto.get(p.id) ?? { x: 0, y: 0 });
  }
  return positions;
}

/**
 * Reorder lateral relations left→right by date of birth, eldest first: partners
 * within a couple, and lateral units (a couple counts as one) within a set of
 * siblings. Operates in place on `auto` (dagre's top-left positions), rank by
 * rank from the top, translating each node's descendants by the same delta so
 * subtrees stay attached. Cross-family order within a rank is untouched — only
 * the x-slots already owned by a sibling cluster are permuted.
 */
function orderLateralByDob(
  auto: Map<string, XY>,
  people: LayoutPerson[],
  parentEdges: LayoutRelationship[],
  spouseEdges: LayoutRelationship[],
) {
  const dobById = new Map(people.map((p) => [p.id, p.date_of_birth ?? null]));
  const dob = (id: string) => dobById.get(id) || "9999-12-31";

  // Couple units: spouse-connected components.
  const couple = new UnionFind();
  for (const p of people) couple.find(p.id);
  for (const e of spouseEdges) couple.union(e.from_person, e.to_person);

  // Family clusters on a rank: spouses, plus anyone who shares a parent.
  const family = new UnionFind();
  for (const p of people) family.find(p.id);
  for (const e of spouseEdges) family.union(e.from_person, e.to_person);
  const kidsByParent = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();
  for (const e of parentEdges) {
    (kidsByParent.get(e.from_person) ??
      kidsByParent.set(e.from_person, []).get(e.from_person)!).push(
      e.to_person,
    );
    (parentsOf.get(e.to_person) ??
      parentsOf.set(e.to_person, []).get(e.to_person)!).push(e.from_person);
  }
  for (const kids of kidsByParent.values())
    for (let i = 1; i < kids.length; i++) family.union(kids[0], kids[i]);

  // Group people into ranks by their (rounded) y.
  const byRank = new Map<number, string[]>();
  for (const p of people) {
    const y = Math.round(auto.get(p.id)!.y);
    (byRank.get(y) ?? byRank.set(y, []).get(y)!).push(p.id);
  }

  const shift = new Map<string, number>(); // cumulative x delta vs dagre

  for (const y of [...byRank.keys()].sort((a, b) => a - b)) {
    const rankIds = byRank.get(y)!;

    // 1. Each node inherits the average shift of its parents.
    for (const id of rankIds) {
      const ps = (parentsOf.get(id) ?? []).filter((p) => shift.has(p));
      if (ps.length === 0) continue;
      const d = ps.reduce((s, p) => s + shift.get(p)!, 0) / ps.length;
      auto.get(id)!.x += d;
      shift.set(id, d);
    }

    // 2. Permute x-slots within each sibling cluster by DOB.
    const clusters = new Map<string, string[]>();
    for (const id of rankIds)
      (clusters.get(family.find(id)) ??
        clusters.set(family.find(id), []).get(family.find(id))!).push(id);

    for (const members of clusters.values()) {
      if (members.length < 2) continue;

      const units = new Map<string, string[]>();
      for (const m of members)
        (units.get(couple.find(m)) ??
          units.set(couple.find(m), []).get(couple.find(m))!).push(m);

      const single = [...units.values()][0];
      if (units.size < 2 && single.length < 2) continue;

      const slots = members.map((m) => auto.get(m)!.x).sort((a, b) => a - b);
      const unitKey = (u: string[]) => u.map(dob).sort()[0];
      const orderedUnits = [...units.values()].sort((a, b) => {
        const ka = unitKey(a);
        const kb = unitKey(b);
        return ka < kb ? -1 : ka > kb ? 1 : a[0].localeCompare(b[0]);
      });

      let slot = 0;
      for (const unit of orderedUnits) {
        const ordered = [...unit].sort((a, b) => {
          const ka = dob(a);
          const kb = dob(b);
          return ka < kb ? -1 : ka > kb ? 1 : a.localeCompare(b);
        });
        for (const m of ordered) {
          const newX = slots[slot++];
          const delta = newX - auto.get(m)!.x;
          auto.get(m)!.x = newX;
          shift.set(m, (shift.get(m) ?? 0) + delta);
        }
      }
    }
  }
}
