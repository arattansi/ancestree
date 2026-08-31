"use client";

import * as React from "react";
import Link from "next/link";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import { toast } from "sonner";

import "@xyflow/react/dist/style.css";

import { setPersonPosition } from "@/app/actions/people";
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
import { layoutTree, NODE_W, NODE_H } from "@/lib/tree-layout";
import { personDisplayName } from "@/lib/person-name";
import type { TreeGraphEdge, TreeGraphPerson } from "@/lib/tree";
import type { PersonRelation } from "@/components/tree/person-panel";

/**
 * Invisible layout-only node that sits on a couple's spouse line. A single
 * "descent" edge runs from here down to each shared child, so a two-parent
 * child shows one line from the marriage instead of one line per parent.
 */
function UnionNode() {
  return (
    <div className="size-px">
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

const nodeTypes = { person: PersonNode, union: UnionNode };

type Props = {
  people: TreeGraphPerson[];
  relationships: TreeGraphEdge[];
  treeId: string;
  selfPersonId: string | null;
  currentUserId: string;
  isAdmin: boolean;
  claimCandidates: ClaimCandidate[];
  panelSuggestions: PanelSuggestion[];
};

function buildGraph(
  people: TreeGraphPerson[],
  relationships: TreeGraphEdge[],
  selfPersonId: string | null,
) {
  const positions = layoutTree(people, relationships);
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

  const parentEdges = relationships.filter(
    (r) => r.type === "parent" && ids.has(r.from_person) && ids.has(r.to_person),
  );

  // Spouse pairs, keyed order-independently, so a child of a married couple
  // can be hung off one shared "union" point instead of two parent edges.
  const pairKey = (a: string, b: string) => [a, b].sort().join("~");
  const spousePairs = new Set(
    relationships
      .filter(
        (r) =>
          r.type === "spouse" && ids.has(r.from_person) && ids.has(r.to_person),
      )
      .map((r) => pairKey(r.from_person, r.to_person)),
  );

  const parentsByChild = new Map<string, string[]>();
  for (const r of parentEdges) {
    const list = parentsByChild.get(r.to_person) ?? [];
    if (!list.includes(r.from_person)) list.push(r.from_person);
    parentsByChild.set(r.to_person, list);
  }

  const edges: Edge[] = [];
  const unionNodes = new Map<string, Node>();
  // Children whose parent edges are drawn via a couple union (skipped below).
  const childrenViaUnion = new Set<string>();

  const parentEdgeStyle = { stroke: "var(--border)", strokeWidth: 1.5 };

  for (const [child, parents] of parentsByChild) {
    if (parents.length !== 2 || !spousePairs.has(pairKey(parents[0], parents[1])))
      continue;
    const a = positions.get(parents[0]);
    const b = positions.get(parents[1]);
    if (!a || !b) continue;

    const unionId = `u:${pairKey(parents[0], parents[1])}`;
    if (!unionNodes.has(unionId)) {
      unionNodes.set(unionId, {
        id: unionId,
        type: "union",
        // Centre of the two partner nodes — sits on the spouse line.
        position: {
          x: (a.x + b.x) / 2 + NODE_W / 2,
          y: (a.y + b.y) / 2 + NODE_H / 2,
        },
        data: {},
        draggable: false,
        selectable: false,
        focusable: false,
      });
    }
    edges.push({
      id: `d:${unionId}->${child}`,
      source: unionId,
      target: child,
      type: "smoothstep",
      style: parentEdgeStyle,
    });
    childrenViaUnion.add(child);
  }

  for (const r of parentEdges) {
    if (childrenViaUnion.has(r.to_person)) continue;
    edges.push({
      id: `p:${r.from_person}->${r.to_person}`,
      source: r.from_person,
      target: r.to_person,
      type: "smoothstep",
      style: parentEdgeStyle,
    });
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
      type: "straight",
      selectable: false,
      style: {
        stroke: "var(--muted-foreground)",
        strokeWidth: 1.5,
        // Divorced pairs get a sparser, fainter dash than a current marriage.
        strokeDasharray: r.is_divorced ? "2 5" : "5 4",
        opacity: r.is_divorced ? 0.6 : 1,
      },
    });
  }

  return { nodes: [...nodes, ...unionNodes.values()], edges };
}

function Canvas({
  people,
  relationships,
  treeId,
  selfPersonId,
  currentUserId,
  isAdmin,
  claimCandidates,
  panelSuggestions,
}: Props) {
  const claimableIds = React.useMemo(
    () => new Set(claimCandidates.map((c) => c.id)),
    [claimCandidates],
  );
  const initial = React.useMemo(
    () => buildGraph(people, relationships, selfPersonId),
    [people, relationships, selfPersonId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, , onEdgesChange] = useEdgesState(initial.edges);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<TreeFilter>(EMPTY_FILTER);
  const { fitView } = useReactFlow();

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
    setSelectedId(node.id);
  }, []);

  const onNodeDragStop = React.useCallback<OnNodeDrag>((_, node) => {
    void setPersonPosition(node.id, node.position.x, node.position.y).then(
      (res) => {
        if (res.error) toast.error(res.error);
      },
    );
  }, []);

  const selectedPerson =
    people.find((p) => p.id === selectedId) ?? null;

  const relations = React.useMemo<PersonRelation[]>(() => {
    if (!selectedId) return [];
    const nameById = new Map(people.map((p) => [p.id, personDisplayName(p)]));
    return relationships
      .filter(
        (r) => r.from_person === selectedId || r.to_person === selectedId,
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
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => setSelectedId(null)}
        colorMode="system"
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.15}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        nodesDraggable
      >
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
          <Button
            nativeButton={false}
            render={<Link href="/people/new" />}
            size="sm"
          >
            Add a relative
          </Button>
          {multiTreeEnabled ? (
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
        <Panel position="top-left" className="flex flex-col gap-2">
          <TreeSearch
            people={people}
            filter={filter}
            onFilterChange={setFilter}
            onPick={onPick}
          />
          {claimCandidates.length > 0 ? (
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
