"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  getSmoothStepPath,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeMouseHandler,
  type OnNodeDrag,
  type ReactFlowState,
} from "@xyflow/react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import "@xyflow/react/dist/style.css";

import { autoArrangeTree, setPersonPosition } from "@/app/actions/people";
import { setPetPosition } from "@/app/actions/pets";
import { ClaimSuggestions } from "@/components/tree/claim-suggestions";
import { PersonNode } from "@/components/tree/person-node";
import { PersonPanel } from "@/components/tree/person-panel";
import { PetNode } from "@/components/tree/pet-node";
import { PetPanel } from "@/components/tree/pet-panel";
import { TreeSearch } from "@/components/tree/tree-search";
import {
  EMPTY_FILTER,
  isFilterActive,
  matchesFilter,
  petMatchesFilter,
  type TreeFilter,
} from "@/lib/tree-search";
import { Button } from "@/components/ui/button";
import type { ClaimCandidate } from "@/lib/claims";
import type { PanelSuggestion } from "@/lib/connection-suggestions";
import { multiTreeEnabled } from "@/lib/flags";
import { cn } from "@/lib/utils";
import {
  bloodline,
  descentGeometry,
  lateralGeometry,
  layoutTree,
  NODE_H,
  NODE_W,
  type CardRect,
  type Descent,
  type Lateral,
  type GenerationBand,
  type TreeLayout,
} from "@/lib/tree-layout";
import { layoutPets } from "@/lib/pet-layout";
import type { TreePet } from "@/lib/pets";
import { personDisplayName } from "@/lib/person-name";
import type { TreeGraphEdge, TreeGraphPerson } from "@/lib/tree";
import type { PersonRelation } from "@/components/tree/person-panel";

// Spotlight palette from the 🌳 emoji: the ringed cards glow foliage green
// (#77B255, in person-node.tsx); the connection lines take the trunk brown.
const SPOTLIGHT_BROWN = "#A57939";

const sameDescent = (a: Descent, b: Descent) =>
  a.startX === b.startX && a.startY === b.startY && a.busY === b.busY;

/**
 * A descent line from a couple down to one child.
 *
 * The junction it starts from is *derived from the parents' live positions*
 * rather than being a node of its own — an invisible node would sit where the
 * layout first put it and stay there while you dragged its parents around,
 * leaving the line detached from them. Reading the parents straight out of the
 * store means the trunk follows every drag, on either side of the connection.
 *
 * All of a couple's children bend at the same `busY`, so their trunks overlap
 * exactly and a marriage reads as one trunk plus a stub per child rather than
 * one diagonal each.
 */
function DescentEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  style,
}: EdgeProps) {
  const parents = React.useMemo(
    () => (Array.isArray(data?.parents) ? (data.parents as string[]) : []),
    [data],
  );
  // The layout's own geometry, used until the cards have been measured.
  const fallback = React.useMemo<Descent>(
    () => ({
      startX: typeof data?.startX === "number" ? data.startX : sourceX,
      startY: typeof data?.startY === "number" ? data.startY : sourceY,
      busY:
        typeof data?.busY === "number" ? data.busY : (sourceY + targetY) / 2,
    }),
    [sourceX, sourceY, targetY, data],
  );

  const descent = useStore(
    React.useCallback(
      (state: ReactFlowState): Descent => {
        const rects = parents
          .map((parentId) => {
            const node = state.nodeLookup.get(parentId);
            if (!node) return null;
            const { x, y } = node.internals.positionAbsolute;
            return {
              x,
              y,
              w: node.measured?.width ?? NODE_W,
              h: node.measured?.height ?? NODE_H,
            };
          })
          .filter((rect): rect is CardRect => rect !== null);
        return descentGeometry(rects, targetY) ?? fallback;
      },
      [parents, fallback, targetY],
    ),
    sameDescent,
  );

  const [path] = getSmoothStepPath({
    sourceX: descent.startX,
    sourceY: descent.startY,
    sourcePosition: Position.Bottom,
    targetX,
    targetY,
    targetPosition: Position.Top,
    borderRadius: 10,
    centerY: descent.busY,
  });
  return <BaseEdge id={id} path={path} style={style} />;
}

/**
 * The line between two partners.
 *
 * Drawn level, through the vertical middle of both cards, so a marriage reads
 * as a lateral connection rather than a slightly sloped mistake. Positions come
 * from the store rather than from the handles so the line stays level even if a
 * card's height ever varies again; if a partner has been dragged out of line it
 * steps around at right angles instead of going diagonal.
 */
function SpouseEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  style,
}: EdgeProps) {
  const pair = React.useMemo(
    () => (Array.isArray(data?.pair) ? (data.pair as string[]) : []),
    [data],
  );

  const lateral = useStore(
    React.useCallback(
      (state: ReactFlowState): Lateral | null => {
        const [a, b] = pair.map((nodeId) => {
          const node = state.nodeLookup.get(nodeId);
          if (!node) return null;
          const { x, y } = node.internals.positionAbsolute;
          return {
            x,
            y,
            w: node.measured?.width ?? NODE_W,
            h: node.measured?.height ?? NODE_H,
          };
        });
        return a && b ? lateralGeometry(a, b) : null;
      },
      [pair],
    ),
    (a, b) => a?.y === b?.y && a?.jogged === b?.jogged,
  );

  // A partner dragged off the row: step around it rather than slope across.
  if (lateral?.jogged) {
    const [stepped] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition: Position.Right,
      targetX,
      targetY,
      targetPosition: Position.Left,
      borderRadius: 8,
    });
    return <BaseEdge id={id} path={stepped} style={style} />;
  }

  const y = lateral?.y ?? sourceY;
  return (
    <BaseEdge
      id={id}
      path={`M ${sourceX},${y} L ${targetX},${y}`}
      style={style}
    />
  );
}

/**
 * A generation lane behind the cards: alternating tint plus a label naming the
 * row relative to the founders ("Grandparents · b. 1930s"). This is what makes
 * a large chart scannable — you can find a generation without tracing edges.
 */
function GenerationLane({
  band,
  minX,
  maxX,
}: {
  band: GenerationBand;
  minX: number;
  maxX: number;
}) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        transform: `translate(${minX}px, ${band.y}px)`,
        width: maxX - minX,
        height: band.height,
      }}
    >
      <div
        className={cn(
          "size-full rounded-2xl border border-border/30",
          band.generation % 2 === 0 ? "bg-muted/25" : "bg-transparent",
        )}
      />
      <div className="absolute top-2 left-4 flex items-baseline gap-2 text-xs">
        <span className="font-medium text-muted-foreground">{band.label}</span>
        {band.sublabel ? (
          <span className="text-muted-foreground/60">{band.sublabel}</span>
        ) : null}
        <span className="text-muted-foreground/50">
          {band.count} {band.count === 1 ? "person" : "people"}
        </span>
      </div>
    </div>
  );
}

const edgeTypes = { descent: DescentEdge, spouse: SpouseEdge };

const nodeTypes = { person: PersonNode, pet: PetNode };

type Props = {
  people: TreeGraphPerson[];
  relationships: TreeGraphEdge[];
  treeId: string;
  selfPersonId: string | null;
  /** The founding admins' entries — the tree is centred on them. */
  anchorIds: string[];
  currentUserId: string;
  isAdmin: boolean;
  claimCandidates: ClaimCandidate[];
  panelSuggestions: PanelSuggestion[];
  /** Companion animals, hung off the people they belong to (never relatives). */
  pets: TreePet[];
  /** Public share-link view: render the canvas without any editing controls. */
  readOnly?: boolean;
};

/** Which way a bloodline spotlight runs from the person who was clicked. */
type BloodlineDirection = "up" | "down";

/** A spotlighted connection: the edge, and the direction the click chose. */
type SelectedEdge = { id: string; direction: BloodlineDirection };

function buildGraph(
  people: TreeGraphPerson[],
  relationships: TreeGraphEdge[],
  pets: TreePet[],
  selfPersonId: string | null,
  anchorIds: string[],
): {
  nodes: Node[];
  edges: Edge[];
  layout: TreeLayout;
  petPositions: Map<string, { x: number; y: number }>;
} {
  const layout = layoutTree(people, relationships, { anchorIds });
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
          startX: union.startX,
          startY: union.startY,
          busY: union.busY,
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
  const petLayout = layoutPets(
    pets.map((pet) => ({
      id: pet.id,
      companions: pet.companions,
      pos_dx: pet.pos_dx,
      pos_dy: pet.pos_dy,
    })),
    layout.autoPositions,
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

/**
 * The canvas controls sit as bare symbols so they stay out of the way of the
 * tree, and widen to spell themselves out when you point at one.
 */
function ExpandingLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-200 ease-out group-hover/expand:grid-cols-[1fr] group-focus-visible/expand:grid-cols-[1fr]">
      <span className="overflow-hidden whitespace-nowrap">
        <span className="pl-1.5">{children}</span>
      </span>
    </span>
  );
}

/** Three upright bars — the auto-arrange symbol. */
function ColumnsIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M3.5 3v10M8 3v10M12.5 3v10" />
    </svg>
  );
}

function Canvas({
  people,
  relationships,
  treeId,
  selfPersonId,
  anchorIds,
  currentUserId,
  isAdmin,
  claimCandidates,
  panelSuggestions,
  pets,
  readOnly = false,
}: Props) {
  const claimableIds = React.useMemo(
    () => new Set(claimCandidates.map((c) => c.id)),
    [claimCandidates],
  );
  const graph = React.useMemo(
    () => buildGraph(people, relationships, pets, selfPersonId, anchorIds),
    [people, relationships, pets, selfPersonId, anchorIds],
  );
  const nameById = React.useMemo(
    () => new Map(people.map((p) => [p.id, personDisplayName(p)])),
    [people],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [selectedPetId, setSelectedPetId] = React.useState<string | null>(null);
  // The spotlighted connection, plus which way along it the click pointed.
  const [selectedEdgeId, setSelectedEdgeId] =
    React.useState<SelectedEdge | null>(null);
  const [filter, setFilter] = React.useState<TreeFilter>(EMPTY_FILTER);
  const [arranging, setArranging] = React.useState(false);
  const { fitView, getNode, screenToFlowPosition } = useReactFlow();

  // React Flow's own `colorMode="system"` reads the OS preference while it
  // renders, so the server said "light", the client said "dark", and hydration
  // complained — and the canvas ignored the member's own Light/Dark choice.
  // Drive it from the app's theme instead, holding the server's value until
  // mounted (the same guard `theme-toggle.tsx` uses).
  const { resolvedTheme } = useTheme();
  const [themeReady, setThemeReady] = React.useState(false);
  React.useEffect(() => {
    function markMounted() {
      setThemeReady(true);
    }
    markMounted();
  }, []);
  const colorMode = themeReady && resolvedTheme === "dark" ? "dark" : "light";

  // Re-seed the canvas whenever the graph itself changes — a new relative, or
  // an auto-arrange that cleared everybody's nudges.
  React.useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph, setNodes, setEdges]);

  React.useEffect(() => {
    setNodes((current) =>
      current.map((n) => {
        const selected =
          n.type === "pet" ? n.id === selectedPetId : n.id === selectedId;
        return n.data.selected === selected
          ? n
          : { ...n, data: { ...n.data, selected } };
      }),
    );
  }, [selectedId, selectedPetId, setNodes]);

  const filterActive = isFilterActive(filter);
  const matchingIds = React.useMemo(() => {
    if (!filterActive) return null;
    return new Set(
      people.filter((p) => matchesFilter(p, filter)).map((p) => p.id),
    );
  }, [people, filter, filterActive]);

  React.useEffect(() => {
    const petById = new Map(pets.map((pet) => [pet.id, pet]));
    setNodes((current) =>
      current.map((n) => {
        let dimmed = false;
        if (matchingIds !== null) {
          if (n.type === "pet") {
            const pet = petById.get(n.id);
            dimmed = pet ? !petMatchesFilter(pet, filter, matchingIds) : false;
          } else {
            dimmed = !matchingIds.has(n.id);
          }
        }
        return n.data.dimmed === dimmed
          ? n
          : { ...n, data: { ...n.data, dimmed } };
      }),
    );
  }, [matchingIds, filter, pets, setNodes]);

  // Clicking a connection: work out what it joins, name it, and collect the
  // nodes and edges the spotlight should keep lit.
  const connection = React.useMemo(() => {
    if (!selectedEdgeId) return null;
    const edge = graph.edges.find((e) => e.id === selectedEdgeId.id);
    if (!edge) return null;

    if (edge.type === "descent") {
      // A descent line is one link in a bloodline, so light the whole run of
      // them rather than the single link that was clicked. Which run depends on
      // which end of the line the click was nearer — see `onEdgeClick`.
      const { direction } = selectedEdgeId;
      const parents = (
        Array.isArray(edge.data?.parents) ? edge.data.parents : []
      ) as string[];
      // Looking up, the run belongs to the child at the bottom of the line;
      // looking down, it belongs to the parents at the top.
      const roots = direction === "up" ? [edge.target] : parents;
      const rootNames = roots
        .map((pid) => nameById.get(pid))
        .filter((n): n is string => !!n);
      if (rootNames.length === 0) return null;

      const line = new Set<string>();
      for (const root of roots)
        for (const id of bloodline(root, relationships, direction))
          line.add(id);
      if (line.size === 0) return null;

      const edgeIds = new Set<string>();
      const forks: string[][] = [];
      for (const e of graph.edges) {
        if (e.type !== "descent") continue;
        // The descent lines that make up the run: going up, every line arriving
        // at the person or at one of their ancestors; going down, every line
        // arriving at one of their descendants. Either way a line arriving at
        // somebody off the bloodline — a sibling, an in-law — stays dim.
        const onLine =
          line.has(e.target) || (direction === "up" && e.target === roots[0]);
        if (!onLine) continue;
        edgeIds.add(e.id);
        forks.push(
          (Array.isArray(e.data?.parents) ? e.data.parents : []) as string[],
        );
      }
      for (const e of graph.edges) {
        if (e.type !== "spouse") continue;
        const pair = (
          Array.isArray(e.data?.pair) ? e.data.pair : []
        ) as string[];
        // A spouse line is the fork its couple's children hang off, so light it
        // whenever a lit descent line actually leaves it. Matching on the fork
        // rather than on the bloodline keeps a married-in partner's half of the
        // fork lit too — going down, the trunk to a grandchild leaves the line
        // between a descendant and the person they had that child with.
        if (
          pair.length > 0 &&
          forks.some(
            (parents) =>
              parents.length === pair.length &&
              parents.every((pid) => pair.includes(pid)),
          )
        )
          edgeIds.add(e.id);
      }

      const kind = direction === "up" ? "ancestor" : "descendant";
      return {
        endpoints: new Set<string>([...roots, ...line]),
        edgeIds,
        label: direction === "up" ? "Ancestors" : "Descendants",
        separator: direction === "up" ? "↑" : "↓",
        from: rootNames.join(" & "),
        to: `${line.size} ${kind}${line.size > 1 ? "s" : ""}`,
      };
    }

    if (edge.type === "spouse") {
      const pair = (
        Array.isArray(edge.data?.pair) ? edge.data.pair : []
      ) as string[];
      const [aName, bName] = pair.map((pid) => nameById.get(pid));
      if (!aName || !bName) return null;
      const rel = relationships.find(
        (r) =>
          r.type === "spouse" &&
          ((r.from_person === pair[0] && r.to_person === pair[1]) ||
            (r.from_person === pair[1] && r.to_person === pair[0])),
      );
      return {
        endpoints: new Set<string>(pair),
        edgeIds: new Set<string>([edge.id]),
        label: rel?.is_divorced ? "Former spouses" : "Spouses",
        separator: "—",
        from: aName,
        to: bName,
      };
    }

    return null;
  }, [selectedEdgeId, graph.edges, nameById, relationships]);

  // Ring the people at each end of the clicked connection.
  React.useEffect(() => {
    const endpoints = connection?.endpoints ?? null;
    setNodes((current) =>
      current.map((n) => {
        if (n.type !== "person") return n;
        const highlighted = endpoints?.has(n.id) ?? false;
        return n.data.highlighted === highlighted
          ? n
          : { ...n, data: { ...n.data, highlighted } };
      }),
    );
  }, [connection, setNodes]);

  // Fade every connection except the spotlighted run — for a descent line the
  // whole bloodline above it — and draw those in trunk brown.
  const displayEdges = React.useMemo(() => {
    const activeIds = connection?.edgeIds ?? null;
    if (!activeIds) return edges;
    return edges.map((e) => {
      const active = activeIds.has(e.id);
      return {
        ...e,
        style: {
          ...e.style,
          ...(active
            ? { stroke: SPOTLIGHT_BROWN, strokeWidth: 3, opacity: 1 }
            : { opacity: 0.15 }),
        },
        zIndex: active ? 10 : undefined,
      };
    });
  }, [edges, connection]);

  /**
   * A descent line is below its parents and above its child at the same time,
   * so *where* it was clicked decides whose bloodline is meant: the trunk half,
   * up by the parents, means "below them" and lights their descendants; the
   * stub half, down by the child, means "above them" and lights their
   * ancestors. The horizontal bus between the two is the dividing line.
   */
  const onEdgeClick = React.useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      setSelectedId(null);
      let direction: BloodlineDirection = "up";
      if (edge.type === "descent") {
        const parents = (
          Array.isArray(edge.data?.parents) ? edge.data.parents : []
        ) as string[];
        const child = getNode(edge.target);
        const rects = parents
          .map((parentId) => {
            const node = getNode(parentId);
            if (!node) return null;
            return {
              x: node.position.x,
              y: node.position.y,
              w: node.measured?.width ?? NODE_W,
              h: node.measured?.height ?? NODE_H,
            };
          })
          .filter((rect): rect is CardRect => rect !== null);
        // Fall back to the layout's own bus for a card React Flow has not
        // measured yet, so an early click still picks a sensible direction.
        const busY =
          descentGeometry(rects, child?.position.y ?? 0)?.busY ??
          (typeof edge.data?.busY === "number" ? edge.data.busY : 0);
        direction =
          screenToFlowPosition({ x: event.clientX, y: event.clientY }).y > busY
            ? "up"
            : "down";
      }
      setSelectedEdgeId((cur) =>
        cur?.id === edge.id && cur.direction === direction
          ? null
          : { id: edge.id, direction },
      );
    },
    [getNode, screenToFlowPosition],
  );

  const onPick = React.useCallback(
    (personId: string) => {
      setSelectedPetId(null);
      setSelectedId(personId);
      void fitView({
        nodes: [{ id: personId }],
        duration: 600,
        maxZoom: 1.4,
        minZoom: 1.4,
      });
    },
    [fitView],
  );

  const onNodeClick = React.useCallback<NodeMouseHandler>((_, node) => {
    setSelectedEdgeId(null);
    if (node.type === "pet") {
      setSelectedId(null);
      setSelectedPetId(node.id);
      return;
    }
    if (node.type !== "person") return;
    setSelectedPetId(null);
    setSelectedId(node.id);
  }, []);

  // A drag is stored as a nudge from where the layout put the card, so the
  // card keeps its offset as the tree grows instead of freezing in place.
  const onNodeDragStop = React.useCallback<OnNodeDrag>(
    (_, node) => {
      if (node.type === "pet") {
        const spot = graph.petPositions.get(node.id);
        if (!spot) return;
        void setPetPosition(
          node.id,
          node.position.x - spot.x,
          node.position.y - spot.y,
        ).then((res) => {
          if (res.error) toast.error(res.error);
        });
        return;
      }
      if (node.type !== "person") return;
      const auto = graph.layout.autoPositions.get(node.id);
      if (!auto) return;
      void setPersonPosition(
        node.id,
        node.position.x - auto.x,
        node.position.y - auto.y,
      ).then((res) => {
        if (res.error) toast.error(res.error);
      });
    },
    [graph],
  );

  const onAutoArrange = React.useCallback(() => {
    setArranging(true);
    void autoArrangeTree(treeId)
      .then((res) => {
        if (res.error) toast.error(res.error);
        else toast.success("Tree re-arranged.");
      })
      .finally(() => setArranging(false));
  }, [treeId]);

  const selectedPerson = people.find((p) => p.id === selectedId) ?? null;
  const selectedPet = pets.find((pet) => pet.id === selectedPetId) ?? null;

  const peopleOptions = React.useMemo(
    () => people.map((p) => ({ id: p.id, label: personDisplayName(p) })),
    [people],
  );

  // A companion is editable by whoever added it, an admin, or anyone who can
  // already edit one of its people — looser than a person entry on purpose.
  const canEditPet =
    !!selectedPet &&
    (isAdmin ||
      selectedPet.created_by === currentUserId ||
      selectedPet.companions.some((id) => {
        const person = people.find((p) => p.id === id);
        return (
          !!person &&
          (person.owner_user_id === currentUserId ||
            (person.created_by === currentUserId &&
              person.owner_user_id === person.created_by &&
              person.claim_status !== "approved"))
        );
      }));

  const relations = React.useMemo<PersonRelation[]>(() => {
    if (!selectedId) return [];
    const nameById = new Map(people.map((p) => [p.id, personDisplayName(p)]));
    return relationships
      .filter(
        (r) =>
          (r.type === "parent" || r.type === "spouse") &&
          (r.from_person === selectedId || r.to_person === selectedId),
      )
      .flatMap((r) => {
        const otherId =
          r.from_person === selectedId ? r.to_person : r.from_person;
        const otherName = nameById.get(otherId);
        if (!otherName) return [];
        // parent edges are stored from = parent, to = child.
        const kind: PersonRelation["kind"] =
          r.type === "spouse"
            ? "spouse"
            : r.from_person === selectedId
              ? "child"
              : "parent";
        return [
          {
            id: r.id,
            otherName,
            kind,
            marriageDate: r.marriage_date,
            isDivorced: r.is_divorced,
            divorceDate: r.divorce_date,
            canEdit: isAdmin || r.created_by === currentUserId,
          },
        ];
      });
  }, [selectedId, relationships, people, isAdmin, currentUserId]);
  const canEdit =
    !!selectedPerson &&
    (isAdmin ||
      selectedPerson.owner_user_id === currentUserId ||
      (selectedPerson.created_by === currentUserId &&
        selectedPerson.owner_user_id === selectedPerson.created_by &&
        selectedPerson.claim_status !== "approved"));

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeDragStop={readOnly ? undefined : onNodeDragStop}
        onPaneClick={() => {
          setSelectedId(null);
          setSelectedPetId(null);
          setSelectedEdgeId(null);
        }}
        colorMode={colorMode}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.15}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        nodesDraggable={!readOnly}
      >
        <ViewportPortal>
          {graph.layout.bands.map((band) => (
            <GenerationLane
              key={band.generation}
              band={band}
              minX={graph.layout.extent.minX - 96}
              maxX={graph.layout.extent.maxX + 96}
            />
          ))}
        </ViewportPortal>
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor="var(--muted-foreground)"
          maskColor="var(--muted)"
          className="!hidden !bg-card sm:!block"
        />
        <Panel
          position="top-right"
          className="flex max-w-[45vw] flex-col items-end gap-2 sm:max-w-none"
        >
          {readOnly ? (
            <div className="flex max-w-[15rem] flex-col items-end gap-1.5 rounded-lg border border-border bg-card/95 p-3 text-right shadow-md">
              <span className="text-xs text-muted-foreground">
                You&rsquo;re viewing a read-only copy of this family tree.
              </span>
              <Button
                nativeButton={false}
                render={<Link href="/request-invite" />}
                size="sm"
              >
                Request edit access
              </Button>
            </div>
          ) : (
            <Button
              nativeButton={false}
              render={<Link href="/people/new" />}
              size="sm"
              className="group/expand gap-0"
              aria-label="Add a relative"
            >
              <Plus className="size-4" aria-hidden />
              <ExpandingLabel>Add a relative</ExpandingLabel>
            </Button>
          )}
          {!readOnly && isAdmin ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onAutoArrange}
              disabled={arranging}
              className="group/expand gap-0"
              aria-label="Auto-arrange"
            >
              <ColumnsIcon />
              <ExpandingLabel>
                {arranging ? "Arranging…" : "Auto-arrange"}
              </ExpandingLabel>
            </Button>
          ) : null}
          {!readOnly && multiTreeEnabled ? (
            <Button
              nativeButton={false}
              render={<Link href="/trees/new" />}
              size="sm"
              variant="outline"
            >
              Start your own tree
            </Button>
          ) : null}
        </Panel>
        {connection ? (
          <Panel position="bottom-center">
            <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-md">
              <span className="font-medium text-foreground">
                {connection.label}
              </span>
              <span className="text-muted-foreground">
                {connection.from}
                <span className="mx-1.5 text-muted-foreground/50">
                  {connection.separator}
                </span>
                {connection.to}
              </span>
              <button
                type="button"
                className="text-muted-foreground/60 hover:text-foreground"
                onClick={() => setSelectedEdgeId(null)}
                aria-label="Clear connection highlight"
              >
                ✕
              </button>
            </div>
          </Panel>
        ) : null}
        <Panel position="top-left" className="flex flex-col items-start gap-2">
          <TreeSearch
            people={people}
            filter={filter}
            onFilterChange={setFilter}
            onPick={onPick}
          />
          {!readOnly && claimCandidates.length > 0 ? (
            <ClaimSuggestions candidates={claimCandidates} />
          ) : null}
        </Panel>
      </ReactFlow>

      <PersonPanel
        person={selectedPerson}
        treeId={treeId}
        pets={pets.filter((pet) =>
          selectedId ? pet.companions.includes(selectedId) : false,
        )}
        people={peopleOptions}
        onSelectPet={(petId) => {
          setSelectedId(null);
          setSelectedPetId(petId);
        }}
        suggestions={panelSuggestions.filter(
          (s) =>
            s.subjectPersonId === selectedId ||
            s.relatedPersonId === selectedId,
        )}
        relations={relations}
        isAdmin={isAdmin}
        isSelf={selectedPerson?.id === selfPersonId}
        canEdit={canEdit}
        readOnly={readOnly}
        claimable={!!selectedPerson && claimableIds.has(selectedPerson.id)}
        isCreator={selectedPerson?.created_by === currentUserId}
        currentUserId={currentUserId}
        onClose={() => setSelectedId(null)}
      />

      <PetPanel
        pet={selectedPet}
        treeId={treeId}
        people={peopleOptions}
        canEdit={canEditPet}
        readOnly={readOnly}
        onClose={() => setSelectedPetId(null)}
        onSelectPerson={(personId) => {
          setSelectedPetId(null);
          onPick(personId);
        }}
      />
    </>
  );
}

export function FamilyTree(props: Props) {
  if (props.people.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <h1 className="text-lg font-semibold">The tree is empty</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Add yourself first, then connect relatives to build out the tree.
        </p>
        <Button nativeButton={false} render={<Link href="/onboarding" />}>
          Add yourself
        </Button>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100dvh-3.5rem)] w-full">
      <ReactFlowProvider>
        <Canvas {...props} />
      </ReactFlowProvider>
    </div>
  );
}
