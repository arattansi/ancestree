"use client";

import * as React from "react";
import Link from "next/link";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import { toast } from "sonner";

import "@xyflow/react/dist/style.css";

import { setPersonPosition } from "@/app/actions/people";
import { PersonNode } from "@/components/tree/person-node";
import { PersonPanel } from "@/components/tree/person-panel";
import { Button } from "@/components/ui/button";
import { layoutTree } from "@/lib/tree-layout";
import type { TreeGraphEdge, TreeGraphPerson } from "@/lib/tree";

const nodeTypes = { person: PersonNode };

type Props = {
  people: TreeGraphPerson[];
  relationships: TreeGraphEdge[];
  treeId: string;
  selfPersonId: string | null;
  currentUserId: string;
  isAdmin: boolean;
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
    data: { person, isSelf: person.id === selfPersonId, selected: false },
  }));

  const edges: Edge[] = [];
  for (const r of relationships) {
    if (!ids.has(r.from_person) || !ids.has(r.to_person)) continue;
    if (r.type === "parent") {
      edges.push({
        id: `p:${r.from_person}->${r.to_person}`,
        source: r.from_person,
        target: r.to_person,
        type: "smoothstep",
        style: { stroke: "var(--border)", strokeWidth: 1.5 },
      });
    } else if (r.type === "spouse") {
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
          strokeDasharray: "5 4",
        },
      });
    }
  }
  return { nodes, edges };
}

function Canvas({
  people,
  relationships,
  treeId,
  selfPersonId,
  currentUserId,
  isAdmin,
}: Props) {
  const initial = React.useMemo(
    () => buildGraph(people, relationships, selfPersonId),
    [people, relationships, selfPersonId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, , onEdgesChange] = useEdgesState(initial.edges);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setNodes((current) =>
      current.map((n) =>
        n.data.selected === (n.id === selectedId)
          ? n
          : { ...n, data: { ...n.data, selected: n.id === selectedId } },
      ),
    );
  }, [selectedId, setNodes]);

  const onNodeClick = React.useCallback<NodeMouseHandler>((_, node) => {
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
  const canEdit =
    !!selectedPerson &&
    (isAdmin ||
      selectedPerson.owner_user_id === currentUserId ||
      selectedPerson.created_by === currentUserId);

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
        <Panel position="top-right">
          <Button
            nativeButton={false}
            render={<Link href="/people/new" />}
            size="sm"
          >
            Add a relative
          </Button>
        </Panel>
      </ReactFlow>

      <PersonPanel
        person={selectedPerson}
        treeId={treeId}
        isAdmin={isAdmin}
        isSelf={selectedPerson?.id === selfPersonId}
        canEdit={canEdit}
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
