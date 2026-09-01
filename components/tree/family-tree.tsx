"use client";

import * as React from "react";
import Link from "next/link";
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
import { toast } from "sonner";

import "@xyflow/react/dist/style.css";

import { autoArrangeTree, setPersonPosition } from "@/app/actions/people";
import { ClaimSuggestions } from "@/components/tree/claim-suggestions";
import { PersonNode } from "@/components/tree/person-node";
import { PersonPanel } from "@/components/tree/person-panel";
import { TreeSearch } from "@/components/tree/tree-search";
import {
  EMPTY_FILTER,
  isFilterActive,
  matchesFilter,
  type TreeFilter,
} from "@/lib/tree-search";
import { Button } from "@/components/ui/button";
import type { ClaimCandidate } from "@/lib/claims";
import type { PanelSuggestion } from "@/lib/connection-suggestions";
import { multiTreeEnabled } from "@/lib/flags";
import { cn } from "@/lib/utils";
import {
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
      busY: typeof data?.busY === "number" ? data.busY : (sourceY + targetY) / 2,
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
    <BaseEdge id={id} path={`M ${sourceX},${y} L ${targetX},${y}`} style={style} />
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

const nodeTypes = { person: PersonNode };

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
  /** Public share-link view: render the canvas without any editing controls. */
  readOnly?: boolean;
};

function buildGraph(
  people: TreeGraphPerson[],
  relationships: TreeGraphEdge[],
  selfPersonId: string | null,
  anchorIds: string[],
): { nodes: Node[]; edges: Edge[]; layout: TreeLayout } {
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

  return { nodes, edges, layout };
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
  readOnly = false,
}: Props) {
  const claimableIds = React.useMemo(
    () => new Set(claimCandidates.map((c) => c.id)),
    [claimCandidates],
  );
  const graph = React.useMemo(
    () => buildGraph(people, relationships, selfPersonId, anchorIds),
    [people, relationships, selfPersonId, anchorIds],
  );
  const nameById = React.useMemo(
    () => new Map(people.map((p) => [p.id, personDisplayName(p)])),
    [people],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = React.useState<string | null>(
    null,
  );
  const [filter, setFilter] = React.useState<TreeFilter>(EMPTY_FILTER);
  const [arranging, setArranging] = React.useState(false);
  const { fitView } = useReactFlow();

  // Re-seed the canvas whenever the graph itself changes — a new relative, or
  // an auto-arrange that cleared everybody's nudges.
  React.useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph, setNodes, setEdges]);

  React.useEffect(() => {
    setNodes((current) =>
      current.map((n) =>
        n.type !== "person" || n.data.selected === (n.id === selectedId)
          ? n
          : { ...n, data: { ...n.data, selected: n.id === selectedId } },
      ),
    );
  }, [selectedId, setNodes]);

  const filterActive = isFilterActive(filter);
  const matchingIds = React.useMemo(() => {
    if (!filterActive) return null;
    return new Set(
      people.filter((p) => matchesFilter(p, filter)).map((p) => p.id),
    );
  }, [people, filter, filterActive]);

  React.useEffect(() => {
    setNodes((current) =>
      current.map((n) => {
        if (n.type !== "person") return n;
        const dimmed = matchingIds !== null && !matchingIds.has(n.id);
        return n.data.dimmed === dimmed
          ? n
          : { ...n, data: { ...n.data, dimmed } };
      }),
    );
  }, [matchingIds, setNodes]);

  // Clicking a connection: name the two people it joins and ring them both.
  const connection = React.useMemo(() => {
    if (!selectedEdgeId) return null;
    const edge = graph.edges.find((e) => e.id === selectedEdgeId);
    if (!edge) return null;

    if (edge.type === "descent") {
      const parents = (
        Array.isArray(edge.data?.parents) ? edge.data.parents : []
      ) as string[];
      const parentNames = parents
        .map((pid) => nameById.get(pid))
        .filter((n): n is string => !!n);
      if (parentNames.length === 0) return null;
      // The whole sibling set hangs off this fork, so highlight every child of
      // the union, not just the one whose line was clicked.
      const unionId = edge.id.slice(2).split("->")[0];
      const union = graph.layout.unions.find((u) => u.id === unionId);
      const children = union?.children ?? [edge.target];
      const childNames = children
        .map((cid) => nameById.get(cid))
        .filter((n): n is string => !!n);
      if (childNames.length === 0) return null;
      // Also light up the branch between the parents — the spouse line joining
      // them is the fork the children hang off.
      const parentLink = graph.edges.find(
        (e) =>
          e.type === "spouse" &&
          Array.isArray(e.data?.pair) &&
          parents.every((pid) => (e.data!.pair as string[]).includes(pid)),
      );
      return {
        endpoints: new Set<string>([...parents, ...children]),
        edgeIds: new Set<string>(
          [
            ...children.map((cid) => `d:${unionId}->${cid}`),
            parentLink?.id,
          ].filter((v): v is string => !!v),
        ),
        label: parentNames.length > 1 ? "Parents" : "Parent",
        separator: "→",
        from: parentNames.join(" & "),
        to:
          childNames.length > 1
            ? `${childNames.slice(0, -1).join(", ")} & ${childNames.at(-1)}`
            : childNames[0],
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
  }, [selectedEdgeId, graph.edges, graph.layout.unions, nameById, relationships]);

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

  // Fade every connection except the spotlighted branch — the clicked line plus,
  // for a child, the parents' link — and draw those in trunk brown.
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

  const onEdgeClick = React.useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedId(null);
      setSelectedEdgeId((cur) => (cur === edge.id ? null : edge.id));
    },
    [],
  );

  const onPick = React.useCallback(
    (personId: string) => {
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
    if (node.type !== "person") return;
    setSelectedEdgeId(null);
    setSelectedId(node.id);
  }, []);

  // A drag is stored as a nudge from where the layout put the card, so the
  // card keeps its offset as the tree grows instead of freezing in place.
  const onNodeDragStop = React.useCallback<OnNodeDrag>(
    (_, node) => {
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

  const selectedPerson =
    people.find((p) => p.id === selectedId) ?? null;

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
          setSelectedEdgeId(null);
        }}
        colorMode="system"
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
          className="!bg-card"
        />
        <Panel position="top-right" className="flex flex-col items-end gap-2">
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
            >
              Add a relative
            </Button>
          )}
          {!readOnly && isAdmin ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onAutoArrange}
              disabled={arranging}
            >
              {arranging ? "Arranging…" : "Auto-arrange"}
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
        <Panel position="top-left" className="flex flex-col gap-2">
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
