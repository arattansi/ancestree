
import type { Edge, Node } from "@xyflow/react";

import { layoutPets } from "@/lib/pet-layout";
import type { TreePet } from "@/lib/pets";
import type { TreeGraphEdge, TreeGraphPerson } from "@/lib/tree";
import { layoutTree, type TreeLayout } from "@/lib/tree-layout";

/**
 * A tree as the canvas draws it (Step 77.6, moved out of `family-tree.tsx`):
 * a card per person where the layout puts them, a descent line per child
 * and a line per marriage, and the companions hung off their people. Pure:
 * the same tree gives the same graph.
 */
export function buildGraph(
  people: TreeGraphPerson[],
  relationships: TreeGraphEdge[],
  pets: TreePet[],
  selfPersonId: string | null,
  anchorIds: string[],
  /** Rows fixed from a fuller canvas (`LayoutOptions.generations`). */
  generations?: ReadonlyMap<string, number>,
): {
  nodes: Node[];
  edges: Edge[];
  layout: TreeLayout;
  petPositions: Map<string, { x: number; y: number }>;
} {
  const layout = layoutTree(people, relationships, { anchorIds, generations });
  const { positions, unions } = layout;
  const ids = new Set(people.map((p) => p.id));

  const nodes: Node[] = people.map((person) => ({
    id: person.id,
    type: "person",
    position: positions.get(person.id) ?? { x: 0, y: 0 },
    data: {
      person,
      isSelf: person.id === selfPersonId,
      selected: false,
      dimmed: false,
    },
  }));

  const edges: Edge[] = [];
  const parentEdgeStyle = { stroke: "var(--border)", strokeWidth: 1.5 };

  // One bus-routed descent edge per child. The edge is anchored to a real
  // parent node so React Flow re-renders it whenever that parent moves; it
  // carries the whole parent set in `data` so it can find the junction between
  // them, and the layout's `busY` as a first-paint fallback.
  for (const union of unions) {
    const [primary] = union.parents;
    if (!primary) continue;
    for (const child of union.children) {
      edges.push({
        id: `d:${union.id}->${child}`,
        source: primary,
        target: child,
        type: "descent",
        data: {
          parents: union.parents,
          siblings: union.children,
          startX: union.startX,
          startY: union.startY,
          busY: union.busY,
          stepY: union.stepY,
        },
        style: parentEdgeStyle,
      });
    }
  }

  for (const r of relationships) {
    if (r.type !== "spouse") continue;
    if (!ids.has(r.from_person) || !ids.has(r.to_person)) continue;
    const a = positions.get(r.from_person);
    const b = positions.get(r.to_person);
    const [left, right] =
      (a?.x ?? 0) <= (b?.x ?? 0)
        ? [r.from_person, r.to_person]
        : [r.to_person, r.from_person];
    edges.push({
      id: `s:${left}~${right}`,
      source: left,
      target: right,
      sourceHandle: "r",
      targetHandle: "l",
      type: "spouse",
      data: { pair: [left, right] },
      style: {
        stroke: "var(--muted-foreground)",
        strokeWidth: 1.5,
        // Divorced pairs get a sparser, fainter dash than a current marriage.
        strokeDasharray: r.is_divorced ? "2 5" : "5 4",
        opacity: r.is_divorced ? 0.6 : 1,
      },
    });
  }

  // Companions are laid out *after* the humans, from the human positions, and
  // joined by a dotted lead rather than a descent or spouse line: nothing about
  // a pet is allowed to look like a family edge.
  //
  // The spouse map goes along so a married primary anchors its pet on the
  // couple: a household pet straddles the pair rather than hanging off one of
  // them, whether or not both partners were listed as companions.
  const spousesOf = new Map<string, string[]>();
  for (const r of relationships) {
    if (r.type !== "spouse") continue;
    if (!ids.has(r.from_person) || !ids.has(r.to_person)) continue;
    spousesOf.set(r.from_person, [
      ...(spousesOf.get(r.from_person) ?? []),
      r.to_person,
    ]);
    spousesOf.set(r.to_person, [
      ...(spousesOf.get(r.to_person) ?? []),
      r.from_person,
    ]);
  }

  const petLayout = layoutPets(
    pets.map((pet) => ({
      id: pet.id,
      companions: pet.companions,
      primary: pet.primary_person_id,
      pos_dx: pet.pos_dx,
      pos_dy: pet.pos_dy,
    })),
    layout.autoPositions,
    { spouses: spousesOf },
  );

  for (const pet of pets) {
    const position = petLayout.positions.get(pet.id);
    if (!position) continue;
    nodes.push({
      id: pet.id,
      type: "pet",
      position,
      data: { pet, selected: false, dimmed: false },
    });
    for (const companionId of pet.companions) {
      if (!ids.has(companionId)) continue;
      edges.push({
        id: `c:${companionId}~${pet.id}`,
        source: companionId,
        target: pet.id,
        style: {
          stroke: "var(--muted-foreground)",
          strokeWidth: 1.25,
          strokeDasharray: "1 4",
          strokeLinecap: "round",
          opacity: 0.7,
        },
      });
    }
  }

  return { nodes, edges, layout, petPositions: petLayout.autoPositions };
}
