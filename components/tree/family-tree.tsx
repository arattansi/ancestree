"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  useUpdateNodeInternals,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeMouseHandler,
  type OnNodeDrag,
  type ReactFlowState,
} from "@xyflow/react";
import { Route } from "lucide-react";
import { toast } from "sonner";

import "@xyflow/react/dist/style.css";

import { autoArrangeTree, setPersonPosition } from "@/app/actions/people";
import { setPetPosition } from "@/app/actions/pets";
import { RequestInviteDialog } from "@/components/request-invite-form";
import { AddRelativeButton } from "@/components/tree/add-relative-button";
import { CanvasTip } from "@/components/tree/canvas-tip";
import { ClaimSuggestions } from "@/components/tree/claim-suggestions";
import { GettingStarted } from "@/components/tree/getting-started";
import { bladeTop } from "@/components/tree/leaf-card";
import { PersonNode } from "@/components/tree/person-node";
import { PersonPanel } from "@/components/tree/person-panel";
import { PetNode } from "@/components/tree/pet-node";
import { PetPanel } from "@/components/tree/pet-panel";
import { PersonPicker } from "@/components/tree/person-picker";
import {
  NO_CONNECTION,
  TreeSearch,
  type ConnectionEnds,
} from "@/components/tree/tree-search";
import { useShowCompanions } from "@/components/tree/use-show-companions";
import {
  EMPTY_FILTER,
  isFilterActive,
  matchesFilter,
  petMatchesFilter,
  type TreeFilter,
} from "@/lib/tree-search";
import { Button } from "@/components/ui/button";
import { accountTypeOf } from "@/lib/account-types";
import {
  branchReach,
  canAddRelativeOf,
  canEditCompanion,
  canEditConnection,
  canEditEntry,
  canInviteToClaim,
  canOfferDelete,
  canSeeDocuments,
  lineIds,
  type EntrySubject,
  type Viewer,
} from "@/lib/branch";
import type { EntryInvite } from "@/lib/claim-invites";
import { mergeConfirmation, relativesThatMove } from "@/lib/claim-merge";
import type { ClaimCandidate } from "@/lib/claims";
import { connectionLabel, connectionPath } from "@/lib/connection-path";
import type { PanelSuggestion } from "@/lib/connection-suggestions";
import type { GettingStartedItem } from "@/lib/first-tree";
import { nativeLeaf } from "@/lib/native-leaf";
import { personSpotlight, spotlightPeople } from "@/lib/person-spotlight";
import { onboardingHref } from "@/lib/tree-links";
import { cn } from "@/lib/utils";
import {
  bloodline,
  descentGeometry,
  descentRoute,
  lateralGeometry,
  roundedPolyline,
  siblingBracketPoints,
  leafBranchPath,
  trunkStep,
  layoutTree,
  laneTitleFit,
  laneTitleLeft,
  NODE_H,
  NODE_W,
  type CardRect,
  type Descent,
  type Lateral,
  type GenerationBand,
  type TreeLayout,
  type XY,
} from "@/lib/tree-layout";
import { layoutPets } from "@/lib/pet-layout";
import type { TreePet } from "@/lib/pets";
import { personDisplayName, personHasDied } from "@/lib/person-name";
import type { TreeGraphEdge, TreeGraphPerson } from "@/lib/tree";
import type { PersonRelation } from "@/components/tree/person-panel";

// Spotlight palette, the brand tokens from globals.css: foliage green for the
// cards and the leaves they turn into (person-node.tsx and leaf-card.tsx),
// trunk brown for everything that carries them — branch lines, stems, the pill
// that names the tree you pulled out.
const SPOTLIGHT_BROWN = "var(--brand-brown)";
const SPOTLIGHT_GREEN = "var(--brand-green)";

const sameDescent = (a: Descent, b: Descent) =>
  a.startX === b.startX &&
  a.startY === b.startY &&
  a.busY === b.busY &&
  a.stepY === b.stepY;

/** Where a union's children drop off their bar, and the highest one's top. */
type SiblingBar = { landXs: number[]; top: number };

const sameBar = (a: SiblingBar | null, b: SiblingBar | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.top === b.top &&
    a.landXs.length === b.landXs.length &&
    a.landXs.every((x, i) => x === b.landXs[i]));

const sameRect = (a: CardRect | null, b: CardRect | null) =>
  a?.x === b?.x && a?.y === b?.y && a?.w === b?.w && a?.h === b?.h;

/** One node's live rectangle, or null while it is still unmeasured. */
function rectOf(state: ReactFlowState, nodeId: string): CardRect | null {
  const node = state.nodeLookup.get(nodeId);
  if (!node) return null;
  const { x, y } = node.internals.positionAbsolute;
  return {
    x,
    y,
    w: node.measured?.width ?? NODE_W,
    h: node.measured?.height ?? NODE_H,
  };
}

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
  target,
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
  // Every child hanging off this union's bar, this one included: the trunk
  // meets the bar halfway between the outermost two, wherever they are now.
  const siblings = React.useMemo(
    () => (Array.isArray(data?.siblings) ? (data.siblings as string[]) : []),
    [data],
  );
  // The layout's own geometry, used until the cards have been measured.
  const fallback = React.useMemo<Descent>(
    () => ({
      startX: typeof data?.startX === "number" ? data.startX : sourceX,
      startY: typeof data?.startY === "number" ? data.startY : sourceY,
      busY:
        typeof data?.busY === "number" ? data.busY : (sourceY + targetY) / 2,
      stepY: typeof data?.stepY === "number" ? data.stepY : null,
    }),
    [sourceX, sourceY, targetY, data],
  );

  // Pulled out of the tree, the cards are leaves: a branch that stopped
  // anywhere on top of one would read as a line lying across it, so the line
  // leaves the parents at their stems and comes down over the child, stopping
  // short of its blade — whose top depends on the species, so the spotlight
  // passes it in.
  const toLeaf = data?.toLeaf === true;
  const bladeTop = typeof data?.bladeTop === "number" ? data.bladeTop : 0;

  // Where each sibling drops off the bar — over the middle of its card or
  // leaf — and how high the highest of them sits. Every child of the union
  // reads the same cards, so they all draw the same trunk, step and bar.
  const bar = useStore(
    React.useCallback(
      (state: ReactFlowState): SiblingBar | null => {
        if (siblings.length < 2) return null;
        const rects = siblings
          .map((childId) => rectOf(state, childId))
          .filter((rect): rect is CardRect => rect !== null);
        if (rects.length < 2) return null;
        return {
          landXs: rects.map((r) => r.x + r.w / 2),
          top: Math.min(...rects.map((r) => r.y)),
        };
      },
      [siblings],
    ),
    sameBar,
  );

  // A lone child keeps measuring from its own handle, exactly as before.
  const childTop = bar?.top ?? targetY;
  const descent = useStore(
    React.useCallback(
      (state: ReactFlowState): Descent => {
        const rects = parents
          .map((parentId) => rectOf(state, parentId))
          .filter((rect): rect is CardRect => rect !== null);
        return descentGeometry(rects, childTop, { leafy: toLeaf }) ?? fallback;
      },
      [parents, fallback, childTop, toLeaf],
    ),
    sameDescent,
  );

  // The child's own rectangle, so the branch can stop above its blade rather
  // than at whatever point the target handle happens to have been measured at.
  const childRect = useStore(
    React.useCallback(
      (state: ReactFlowState) => (toLeaf ? rectOf(state, target) : null),
      [target, toLeaf],
    ),
    sameRect,
  );

  const landXs = bar?.landXs ?? [];
  if (toLeaf) {
    const child = childRect ?? {
      x: targetX,
      y: targetY - NODE_H / 2,
      w: NODE_W,
      h: NODE_H,
    };
    return (
      <BaseEdge
        id={id}
        path={leafBranchPath(descent, child, bladeTop, 10, landXs)}
        style={style}
      />
    );
  }

  // Parents off to one side of their children: jog across to the middle of
  // the bar on the way down, so the family hangs evenly off one trunk.
  if (trunkStep(descent, landXs)) {
    const path = roundedPolyline(
      [
        ...descentRoute(descent, targetX, landXs),
        { x: targetX, y: targetY },
      ],
      10,
    );
    return <BaseEdge id={id} path={path} style={style} />;
  }

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
 * The bracket between the spotlighted person and a sibling who shares no
 * parent on the tree (Step 19.3) — joined by a stored "sibling of" row alone,
 * so there is no parents' bus to hang them from. Spotlight-only, and routed
 * from the live cards like every other line so it follows them as they move.
 */
function SiblingBracketEdge({ id, data, style }: EdgeProps) {
  const pair = React.useMemo(
    () => (Array.isArray(data?.pair) ? (data.pair as string[]) : []),
    [data],
  );
  const path = useStore(
    React.useCallback(
      (state: ReactFlowState): string | null => {
        const [a, b] = pair.map((nodeId) => rectOf(state, nodeId));
        return a && b ? roundedPolyline(siblingBracketPoints(a, b), 10) : null;
      },
      [pair],
    ),
  );
  return path ? <BaseEdge id={id} path={path} style={style} /> : null;
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
  faded,
}: {
  band: GenerationBand;
  minX: number;
  maxX: number;
  /** A tree has been pulled out; these lanes belong to the one left behind. */
  faded?: boolean;
}) {
  // Legible at any zoom (Step 32): magnified back to life size when the canvas
  // is zoomed out, rising clear of its row's cards (`laneTitleFit`).
  const zoom = useStore((state: ReactFlowState) => state.transform[2]);
  const title = laneTitleFit(zoom);
  // And in view along the row (32.3): pinned inside the canvas's left edge
  // once the lane's start is panned off it (`laneTitleLeft`), which needs the
  // canvas x of that edge and the title's own width.
  const viewLeft = useStore(
    (state: ReactFlowState) => -state.transform[0] / state.transform[2],
  );
  const titleRef = React.useRef<HTMLDivElement>(null);
  const [titleWidth, setTitleWidth] = React.useState(0);
  React.useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    // Layout width, before the magnification: a font arriving late moves it.
    const measure = () => setTitleWidth(el.offsetWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const titleLeft = laneTitleLeft({
    laneLeft: minX,
    laneWidth: maxX - minX,
    viewLeft,
    zoom,
    width: titleWidth * title.scale,
  });
  return (
    <div
      className={cn(
        "pointer-events-none absolute transition-opacity duration-500",
        faded && "opacity-20",
      )}
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
      <div
        ref={titleRef}
        className="absolute flex origin-top-left items-baseline gap-2 text-xs leading-none whitespace-nowrap"
        style={{
          left: titleLeft,
          top: title.top,
          transform: `scale(${title.scale})`,
        }}
      >
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

const edgeTypes = {
  descent: DescentEdge,
  spouse: SpouseEdge,
  siblingBracket: SiblingBracketEdge,
};

const nodeTypes = { person: PersonNode, pet: PetNode };

const NO_PETS: TreePet[] = [];
const NO_INVITES: EntryInvite[] = [];
const NOBODY: ReadonlySet<string> = new Set();

type Props = {
  people: TreeGraphPerson[];
  relationships: TreeGraphEdge[];
  treeId: string;
  /** The tree's URL slug, for a read-only canvas's "Ask to join" (Step 41.4). */
  treeSlug: string;
  selfPersonId: string | null;
  /** The founding admins' entries — the tree is centred on them. */
  anchorIds: string[];
  /** Every Root's entry: a Branch tends their part of the side of the one they're related to. */
  rootIds: string[];
  currentUserId: string;
  isAdmin: boolean;
  /** The viewer's `profiles.role`; `lib/account-types` says what it reaches. */
  role: string;
  /**
   * Entries that belong to the people they describe — other members' own
   * entries and settled claims. A branch admin edits around these.
   */
  spokenForIds: string[];
  claimCandidates: ClaimCandidate[];
  panelSuggestions: PanelSuggestion[];
  /** Companion animals, hung off the people they belong to (never relatives). */
  pets: TreePet[];
  /**
   * Render the canvas without any editing controls: a share link, or a
   * visitor from another tree (Step 25.4), who is signed in.
   */
  readOnly?: boolean;
  /**
   * The share link being viewed, if this is one: its cards ask whose land a
   * place is through it, since its viewer isn't signed in (Step 27.9).
   */
  shareToken?: string;
  /** A visitor from another tree (Step 25.4): said once, above the canvas. */
  visitorNote?: string | null;
  /** What's left of the founder's first run (Step 29), for the tree's founder. */
  gettingStarted?: GettingStartedItem[] | null;
  /**
   * Invites out to claim entries here, for their cards to say who sent one
   * (Step 38). A member's canvas only: never a share link's or a visitor's.
   */
  claimInvites?: EntryInvite[];
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
  treeSlug,
  selfPersonId,
  anchorIds,
  rootIds,
  currentUserId,
  isAdmin,
  role,
  spokenForIds,
  claimCandidates,
  panelSuggestions,
  pets: allPets,
  readOnly = false,
  shareToken,
  gettingStarted = null,
  claimInvites = NO_INVITES,
}: Props) {
  // Companions stay off the canvas until the viewer switches them on (Step
  // 23). Off the canvas only: a person's details still list theirs, and
  // picking one there still opens it.
  const [showCompanions, setShowCompanions] = useShowCompanions();
  const pets = showCompanions ? allPets : NO_PETS;
  const claimableIds = React.useMemo(
    () => new Set(claimCandidates.map((c) => c.id)),
    [claimCandidates],
  );
  // "This is me" merges the member's own entry into the one they pick, so it
  // asks first, naming who moves (Step 36).
  const claimNotes = React.useMemo(
    () =>
      new Map(
        claimCandidates.map((c) => [
          c.id,
          mergeConfirmation(
            selfPersonId
              ? relativesThatMove(selfPersonId, c.id, people, relationships)
              : [],
          ),
        ]),
      ),
    [claimCandidates, selfPersonId, people, relationships],
  );
  const graph = React.useMemo(
    () => buildGraph(people, relationships, pets, selfPersonId, anchorIds),
    [people, relationships, pets, selfPersonId, anchorIds],
  );
  const nameById = React.useMemo(
    () => new Map(people.map((p) => [p.id, personDisplayName(p)])),
    [people],
  );

  // Who the viewer is for permission purposes. A Branch tends the part of a
  // Root's side they're related through, and a Leaf grows their own line, both
  // worked out from the edges already on the canvas — `lib/branch` mirrors
  // `private.own_branch_ids` and `private.line_ids`, which are what decide.
  const viewer = React.useMemo<Viewer>(() => {
    const type = accountTypeOf(role);
    return {
      userId: currentUserId,
      role,
      selfPersonId,
      branch:
        type.entries === "branch" && selfPersonId
          ? branchReach(selfPersonId, rootIds, relationships)
          : null,
      line:
        type.addRelatives === "line" && selfPersonId
          ? lineIds(selfPersonId, relationships)
          : null,
    };
  }, [currentUserId, role, selfPersonId, rootIds, relationships]);
  const spokenFor = React.useMemo(() => new Set(spokenForIds), [spokenForIds]);
  const entrySubject = React.useCallback(
    (person: TreeGraphPerson): EntrySubject => ({
      id: person.id,
      owner_user_id: person.owner_user_id,
      created_by: person.created_by,
      isClaimed: person.claim_status === "approved",
      isSomeoneElsesOwn: spokenFor.has(person.id),
      isDeceased: personHasDied(person),
    }),
    [spokenFor],
  );

  const personById = React.useMemo(
    () => new Map(people.map((p) => [p.id, p])),
    [people],
  );
  const canEditPersonId = React.useCallback(
    (id: string) => {
      const person = personById.get(id);
      return !!person && canEditEntry(entrySubject(person), viewer);
    },
    [personById, entrySubject, viewer],
  );
  // Cards whose move the database would refuse. They aren't offered as
  // draggable at all — dragging one pans the canvas — instead of moving under
  // the pointer and being refused on drop.
  const lockedIds = React.useMemo(() => {
    const locked = new Set<string>();
    if (readOnly) return locked;
    for (const person of people)
      if (!canEditPersonId(person.id)) locked.add(person.id);
    for (const pet of pets)
      if (!canEditCompanion(pet, viewer, canEditPersonId)) locked.add(pet.id);
    return locked;
  }, [readOnly, people, pets, viewer, canEditPersonId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);
  // `/tree?person=<id>` opens the canvas on one entry — where the "View on
  // tree" button on a notification points. The panel opens on the first render
  // rather than through an effect; only the camera move has to wait (below).
  const focusId = useSearchParams().get("person");
  const focusable =
    focusId && people.some((p) => p.id === focusId) ? focusId : null;
  const [selectedId, setSelectedId] = React.useState<string | null>(focusable);
  // Seeded once per `person`, not once per mount (Step 19.2): after an add the
  // new entry can arrive a render after the canvas does, and a notification
  // can point a canvas that is already open at someone else. Closing the
  // panel doesn't re-open it — the URL hasn't changed.
  const [seededFocus, setSeededFocus] = React.useState(focusable);
  if (focusable && focusable !== seededFocus) {
    setSeededFocus(focusable);
    setSelectedId(focusable);
  }
  const [selectedPetId, setSelectedPetId] = React.useState<string | null>(null);
  // The spotlighted connection, plus which way along it the click pointed.
  const [selectedEdgeId, setSelectedEdgeId] =
    React.useState<SelectedEdge | null>(null);
  const [filter, setFilter] = React.useState<TreeFilter>(EMPTY_FILTER);
  // The two people whose connection is lit, once both are picked — from the
  // filters card, or from the prompt a searched-for person's details carry.
  const [connectionEnds, setConnectionEnds] =
    React.useState<ConnectionEnds>(NO_CONNECTION);
  // Whoever was last opened from a search result: their details offer to show
  // how they are connected to somebody else.
  const [searchedId, setSearchedId] = React.useState<string | null>(null);
  const [arranging, setArranging] = React.useState(false);
  const { getNode, screenToFlowPosition, setCenter } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  // The canvas's own pixel size, for framing the pulled-out tree by hand.
  const paneWidth = useStore((state: ReactFlowState) => state.width);
  const paneHeight = useStore((state: ReactFlowState) => state.height);

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
  //
  // A locked card is seeded with `draggable: false` — only ever `false`: a
  // node's own `true` would override `nodesDraggable={false}` and let cards
  // move while a tree is pulled out. Seeding it here rather than layering it
  // on per render keeps each card the same object through someone else's
  // drag, so only the card being dragged re-renders.
  React.useEffect(() => {
    setNodes(
      lockedIds.size === 0
        ? graph.nodes
        : graph.nodes.map((n) =>
            lockedIds.has(n.id) ? { ...n, draggable: false } : n,
          ),
    );
    setEdges(graph.edges);
  }, [graph, lockedIds, setNodes, setEdges]);

  const filterActive = isFilterActive(filter);
  const matchingIds = React.useMemo(() => {
    if (!filterActive) return null;
    return new Set(
      people.filter((p) => matchesFilter(p, filter)).map((p) => p.id),
    );
  }, [people, filter, filterActive]);

  // Clicking a person: their own tree — the line above and below them, plus
  // the partners along it, and their brothers and sisters beside them (Step
  // 19.3) — and the connections that run through it. Everyone else is blurred
  // back so the one lineage can be read on its own.
  // The chain of relationships between the two picked people, if there is one.
  const path = React.useMemo(
    () =>
      connectionEnds.from && connectionEnds.to
        ? connectionPath(connectionEnds.from, connectionEnds.to, relationships)
        : null,
    [connectionEnds, relationships],
  );

  const spotlight = React.useMemo(() => {
    // A connection between two people is pulled out exactly as one person's
    // tree is: the chain is the lit set, anchored on the first of the two.
    if (path) {
      const lit = new Set<string>([...path.people, ...path.coParents]);
      // Parent→child links the chain walks, whichever way it walked them.
      const links = new Set(
        path.steps.flatMap((s) =>
          s.kind === "up"
            ? [`${s.to}>${s.from}`]
            : s.kind === "down"
              ? [`${s.from}>${s.to}`]
              : [],
        ),
      );
      const edgeIds = new Set<string>();
      for (const e of graph.edges) {
        if (e.type === "descent") {
          const parents = (
            Array.isArray(e.data?.parents) ? e.data.parents : []
          ) as string[];
          if (parents.some((pid) => links.has(`${pid}>${e.target}`)))
            edgeIds.add(e.id);
        } else if (e.type === "spouse") {
          // A marriage the chain crosses, or the couple it turns round on.
          const pair = (
            Array.isArray(e.data?.pair) ? e.data.pair : []
          ) as string[];
          if (pair.length > 0 && pair.every((pid) => lit.has(pid)))
            edgeIds.add(e.id);
        }
      }
      return {
        anchorId: path.people[0],
        people: lit,
        // Companions are nobody's connection: none ride along.
        line: NOBODY,
        siblingSpouses: NOBODY,
        spouseOf: new Map<string, string>(),
        edgeIds,
        ancestors: 0,
        descendants: 0,
        brackets: path.steps
          .filter((s) => s.kind === "sibling")
          .map((s) => [s.from, s.to] as [string, string]),
      };
    }
    if (!selectedId) return null;
    const roles = personSpotlight(selectedId, relationships);
    const { ancestors, descendants, looseSiblings, line, siblingSpouses } =
      roles;
    const lit = spotlightPeople(roles);
    // Whose partner each pill is (Step 19.4), for its "Spouse of …".
    const firstNameById = new Map(
      people.map((p) => [p.id, p.preferred_name || p.first_name || ""]),
    );
    const spouseOf = new Map<string, string>();
    for (const r of relationships) {
      if (r.type !== "spouse") continue;
      for (const [pill, sibling] of [
        [r.from_person, r.to_person],
        [r.to_person, r.from_person],
      ]) {
        if (siblingSpouses.has(pill) && roles.siblings.has(sibling))
          spouseOf.set(pill, firstNameById.get(sibling) || "a sibling");
      }
    }
    const edgeIds = new Set<string>();
    for (const e of graph.edges) {
      if (e.type === "descent") {
        const parents = (
          Array.isArray(e.data?.parents) ? e.data.parents : []
        ) as string[];
        // The child has to be on the line as well as a parent: a lit person's
        // partner brings their own children in otherwise.
        if (lit.has(e.target) && parents.some((pid) => lit.has(pid)))
          edgeIds.add(e.id);
      } else if (e.type === "spouse") {
        const pair = (
          Array.isArray(e.data?.pair) ? e.data.pair : []
        ) as string[];
        if (pair.length > 0 && pair.every((pid) => lit.has(pid)))
          edgeIds.add(e.id);
      } else if (line.has(e.source)) {
        // A companion's dotted lead, hanging off somebody on the line. A
        // sibling's companion stays behind with their children (Step 19.3).
        edgeIds.add(e.id);
      }
    }
    return {
      anchorId: selectedId,
      people: lit,
      line,
      siblingSpouses,
      spouseOf,
      edgeIds,
      ancestors,
      descendants,
      // A sibling with no parents on the tree gets a bracket to the person
      // instead of a bus (Step 19.3).
      brackets: [...looseSiblings].map(
        (sibling) => [selectedId, sibling] as [string, string],
      ),
    };
  }, [path, selectedId, relationships, graph.edges, people]);

  // A card that turns into a leaf is a different piece of DOM with its handles
  // in new elements, and the canvas has no way of knowing that on its own: it
  // keeps the bounds it measured for the rectangle, stops considering the graph
  // initialised, and every edge stays pinned to where a handle used to be.
  // Telling it which cards changed shape puts all of that right.
  const shapeShifted = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const lit = spotlight?.people ?? new Set<string>();
    const changed = [...new Set([...shapeShifted.current, ...lit])];
    shapeShifted.current = new Set(lit);
    if (changed.length > 0) updateNodeInternals(changed);
  }, [spotlight, updateNodeInternals]);

  /**
   * Pull the line clear of the tree it sits in.
   *
   * The spotlit people are laid out again *on their own* — the same layout
   * engine, given only them — so the gaps their siblings, cousins and in-laws
   * were holding open close up and the lineage contracts into a small tree of
   * its own. It is anchored on the person who was clicked, who does not move,
   * so the rest visibly travels inward to them rather than the whole thing
   * jumping somewhere new. Companions come along, keeping their offset from
   * the person they belong to.
   *
   * Nothing here is written back to node state: these positions are painted on
   * over the real ones, so closing the spotlight puts everybody back and no
   * drag is ever recorded against a position the reader didn't choose.
   */
  const pulled = React.useMemo(() => {
    if (!spotlight) return null;
    const { anchorId } = spotlight;
    const lit = spotlight.people;
    const litPeople = people.filter((p) => lit.has(p.id));
    if (litPeople.length < 2) return null;

    const compact = layoutTree(litPeople, relationships, {
      anchorIds: [anchorId],
      // Siblings' partners packed as pills (Step 19.4); the overview layout
      // never passes this, so its positions are untouched.
      compactIds: spotlight.siblingSpouses,
      // Each family hangs straight under its parents' trunk, so the line
      // drops onto the middle of the children's bar with no step.
      centreFamilies: true,
    });
    const anchor = compact.autoPositions.get(anchorId);
    const home = graph.layout.positions.get(anchorId);
    if (!anchor || !home) return null;
    const dx = home.x - anchor.x;
    const dy = home.y - anchor.y;

    const positions = new Map<string, XY>();
    for (const [id, spot] of compact.autoPositions)
      positions.set(id, { x: spot.x + dx, y: spot.y + dy });

    for (const pet of pets) {
      if (!pet.companions.some((id) => spotlight.line.has(id))) continue;
      const primary = pet.primary_person_id ?? pet.companions[0];
      if (!primary) continue;
      const moved = positions.get(primary);
      const wasPerson = graph.layout.positions.get(primary);
      const wasPet = graph.petPositions.get(pet.id);
      if (!moved || !wasPerson || !wasPet) continue;
      positions.set(pet.id, {
        x: wasPet.x + (moved.x - wasPerson.x),
        y: wasPet.y + (moved.y - wasPerson.y),
      });
    }
    return positions;
  }, [spotlight, people, pets, relationships, graph]);

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
        // Everyone the lit lines touch stays bright and the rest of the tree
        // dims — including each fork's other parent, so a married-in partner
        // doesn't fade out from under the line their children hang off.
        cards: new Set<string>([...roots, ...line, ...forks.flat()]),
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
        cards: new Set<string>(pair),
        edgeIds: new Set<string>([edge.id]),
        label: rel?.is_divorced ? "Former spouses" : "Spouses",
        separator: "—",
        from: aName,
        to: bName,
      };
    }

    return null;
  }, [selectedEdgeId, graph.edges, nameById, relationships]);

  // Everything the canvas says about a card beyond where it sits — the ring on
  // the open entry, the fade on a card the search filtered out, the ring on a
  // clicked connection's endpoints, and the spotlight's lit line against its
  // blurred surroundings — is derived here rather than written back into node
  // state. Held as state it went stale every time the graph was re-seeded: the
  // fresh nodes came back with the flags cleared and the open entry quietly
  // lost its ring.
  //
  // It is built off `graph.nodes` — the layout's own copies, which only change
  // when the tree does — rather than off the live `nodes` state, so a drag
  // hands every card back the same `data` object it already had and only the
  // card being dragged re-renders.
  const dataById = React.useMemo(() => {
    const petById = new Map(pets.map((pet) => [pet.id, pet]));
    const endpoints = connection?.endpoints ?? null;
    const lineCards = connection?.cards ?? null;
    const lit = spotlight?.people ?? null;
    // The two people a lit connection runs between stand out from the chain.
    const ends = path
      ? new Set([path.people[0], path.people[path.people.length - 1]])
      : NOBODY;
    const map = new Map<string, Record<string, unknown>>();
    for (const n of graph.nodes) {
      const isPet = n.type === "pet";
      const pet = isPet ? petById.get(n.id) : undefined;
      const selected = isPet
        ? n.id === selectedPetId
        : n.id === selectedId || ends.has(n.id);
      const filteredOut =
        matchingIds === null
          ? false
          : isPet
            ? pet
              ? !petMatchesFilter(pet, filter, matchingIds)
              : false
            : !matchingIds.has(n.id);
      // A clicked line shows only the family it runs through; companions go
      // with the rest, their leads already faded with the other lines.
      const offLine = !!lineCards && (isPet || !lineCards.has(n.id));
      const dimmed = filteredOut || offLine;
      const highlighted = !isPet && (endpoints?.has(n.id) ?? false);
      // A companion follows its people onto the lit line, and off it.
      const inLine = !lit
        ? false
        : isPet
          ? !!pet?.companions.some((id) => spotlight?.line.has(id))
          : lit.has(n.id);
      const compressed =
        !isPet && (spotlight?.siblingSpouses.has(n.id) ?? false);
      map.set(n.id, {
        ...n.data,
        selected,
        dimmed,
        highlighted,
        lineage: !!lit && inLine,
        blurred: (!!lit && !inLine) || (!isPet && !!(n.data as { person?: { blurred?: boolean } }).person?.blurred),
        ...(compressed
          ? { compressed, spouseOf: spotlight?.spouseOf.get(n.id) }
          : {}),
      });
    }
    return map;
  }, [
    graph.nodes,
    pets,
    filter,
    matchingIds,
    connection,
    spotlight,
    path,
    selectedId,
    selectedPetId,
  ]);

  const displayNodes = React.useMemo(
    () =>
      nodes.map((n) => {
        const data = dataById.get(n.id);
        const position = pulled?.get(n.id);
        if (!position && (!data || data === n.data)) return n;
        return {
          ...n,
          ...(data ? { data } : {}),
          ...(position ? { position } : {}),
          // The pulled-out line rides over what is left behind it.
          ...(pulled ? { zIndex: position ? 20 : 0 } : {}),
        };
      }),
    [nodes, dataById, pulled],
  );

  // How far a leaf's blade reaches above its card, so a line into it can stop
  // short of that leaf rather than the tallest one.
  const leafBladeTop = React.useCallback(
    (id: string) => {
      const person = personById.get(id);
      return person ? bladeTop(nativeLeaf(person).shape) : 0;
    },
    [personById],
  );

  // Fade every connection except the spotlighted one — for a descent line the
  // whole bloodline above it, for a person the whole line their tree hangs on
  // — and draw what's left in trunk brown: the lit lines are the branches the
  // leaves grow off, and they thicken as they carry more.
  const displayEdges = React.useMemo(() => {
    const activeIds = connection?.edgeIds ?? spotlight?.edgeIds ?? null;
    if (!activeIds) return edges;
    // While a tree is pulled out its descent lines come down over each leaf
    // and stop just above its blade, whose top depends on the species. Every
    // line into a leaf is routed that way, lit or not: a faded line still
    // crosses the blade it lands on.
    const leaves = pulled ? (spotlight?.people ?? null) : null;
    const shown: Edge[] = edges.map((e) => {
      const active = activeIds.has(e.id);
      const toLeaf = !!leaves && e.type === "descent" && leaves.has(e.target);
      // A half-sibling's other parent stays behind, blurred, in the tree
      // (Step 19.3): route their line from the parent who came along only,
      // or the trunk would start halfway to someone left out of the picture.
      const parents = (
        Array.isArray(e.data?.parents) ? e.data.parents : []
      ) as string[];
      const litParents =
        toLeaf && active ? parents.filter((pid) => leaves.has(pid)) : parents;
      // A bar spans only the children drawn the same way: the leaves pulled
      // out share one, and whoever stayed behind in the tree keeps another.
      const siblings = (
        Array.isArray(e.data?.siblings) ? e.data.siblings : []
      ) as string[];
      const barSiblings =
        leaves && e.type === "descent"
          ? siblings.filter((cid) => leaves.has(cid) === toLeaf)
          : siblings;
      // The pulled layout can seat a partner on the other side (a pill goes
      // on the far side of its sibling, Step 19.4), so a spouse line runs
      // from whoever is on the left now, or it would cross both cards.
      const [from, to] = [pulled?.get(e.source), pulled?.get(e.target)];
      const flip = e.type === "spouse" && !!from && !!to && from.x > to.x;
      return {
        ...e,
        ...(flip
          ? {
              source: e.target,
              target: e.source,
              data: { ...e.data, pair: [e.target, e.source] },
            }
          : {}),
        ...(toLeaf
          ? {
              targetHandle: "l",
              data: {
                ...e.data,
                toLeaf: true,
                bladeTop: leafBladeTop(e.target),
                parents: litParents,
                siblings: barSiblings,
              },
            }
          : barSiblings !== siblings
            ? { data: { ...e.data, siblings: barSiblings } }
            : {}),
        style: {
          ...e.style,
          ...(active
            ? {
                stroke: SPOTLIGHT_BROWN,
                strokeWidth: 3,
                opacity: 1,
                strokeLinecap: "round" as const,
              }
            : { opacity: 0.1 }),
        },
        zIndex: active ? 10 : undefined,
      };
    });
    // Siblings with no parents on the tree get a bracket instead of a bus
    // (Step 19.3), dashed because it stands for a stated relationship rather
    // than a line of descent anyone can trace.
    if (pulled && !connection) {
      for (const [from, sibling] of spotlight?.brackets ?? []) {
        shown.push({
          id: `b:${from}~${sibling}`,
          source: from,
          target: sibling,
          // Handles only anchor the edge; the path comes from the cards.
          sourceHandle: "r",
          targetHandle: "l",
          type: "siblingBracket",
          data: { pair: [from, sibling] },
          selectable: false,
          focusable: false,
          style: {
            stroke: SPOTLIGHT_BROWN,
            strokeWidth: 3,
            strokeDasharray: "6 6",
            strokeLinecap: "round",
          },
          zIndex: 10,
        });
      }
    }
    return shown;
  }, [edges, connection, spotlight, pulled, leafBladeTop]);

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
      setConnectionEnds(NO_CONNECTION);
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
        // The bus sits above the highest sibling, as the edge draws it.
        const siblings = (
          Array.isArray(edge.data?.siblings) ? edge.data.siblings : []
        ) as string[];
        const tops = siblings
          .map((childId) => getNode(childId)?.position.y)
          .filter((y): y is number => y !== undefined);
        const childTop =
          tops.length > 1 ? Math.min(...tops) : (child?.position.y ?? 0);
        const busY =
          descentGeometry(rects, childTop)?.busY ??
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

  const selectPerson = React.useCallback((personId: string) => {
    setSelectedPetId(null);
    setConnectionEnds(NO_CONNECTION);
    setSelectedId(personId);
  }, []);

  // Opening someone from a search result: their details go on to ask who to
  // connect them to.
  const onPick = React.useCallback(
    (personId: string) => {
      selectPerson(personId);
      setSearchedId(personId);
    },
    [selectPerson],
  );

  // Both ends picked and a chain between them: the connection takes over the
  // canvas from whoever was open. With no chain the canvas stays as it was and
  // the filters card says so.
  // Answers whether a connection was lit.
  const onConnectionChange = React.useCallback(
    (next: ConnectionEnds): boolean => {
      setConnectionEnds(next);
      const lit =
        !!next.from &&
        !!next.to &&
        !!connectionPath(next.from, next.to, relationships);
      if (lit) {
        setSelectedId(null);
        setSelectedPetId(null);
        setSelectedEdgeId(null);
      }
      return lit;
    },
    [relationships],
  );

  /**
   * Aim the camera, in both directions.
   *
   * Opening a person's tree frames the *compact* positions their cards are
   * travelling to; closing it frames every card again, so the reader is handed
   * back the whole family rather than left on the patch of canvas the lineage
   * happened to occupy. Both do the arithmetic here rather than calling
   * `fitView`, which reads the canvas's own store — during a pull-out that
   * store is a frame behind, and it holds nothing about the details sheet
   * covering the right-hand side.
   *
   * Gated on the canvas's own first fit rather than on whether every card has
   * been measured: cards change shape here, and a measurement that is briefly
   * out of date should not cost the reader the camera move.
   */
  // The canvas can only be aimed once its pan-zoom exists; before that a
  // camera move is silently dropped. `onInit` fires earlier than that, so this
  // watches the store for the instance itself.
  const canvasReady = useStore((state: ReactFlowState) => !!state.panZoom);
  const frame = React.useCallback(
    (spots: XY[], panelWidth: number, maxZoom: number, duration = 650) => {
      if (spots.length === 0 || !paneWidth || !paneHeight) return;
      const minX = Math.min(...spots.map((s) => s.x));
      const maxX = Math.max(...spots.map((s) => s.x)) + NODE_W;
      const minY = Math.min(...spots.map((s) => s.y));
      const maxY = Math.max(...spots.map((s) => s.y)) + NODE_H;
      const usableW = Math.max(240, paneWidth - panelWidth - 160);
      const usableH = Math.max(240, paneHeight - 220);
      const zoom = Math.min(
        maxZoom,
        usableW / (maxX - minX),
        usableH / (maxY - minY),
      );
      void setCenter(
        (minX + maxX) / 2 + panelWidth / 2 / zoom,
        (minY + maxY) / 2,
        { zoom, duration },
      );
    },
    [paneWidth, paneHeight, setCenter],
  );

  /** The person whose tree the camera is currently framing. */
  const framedRef = React.useRef<string | null>(null);

  // The opening view: the whole tree, once the canvas can be aimed at all.
  const openedRef = React.useRef(false);
  React.useEffect(() => {
    if (!canvasReady || !paneWidth || openedRef.current) return;
    openedRef.current = true;
    // Unless the canvas was opened on somebody (`/tree?person=…`), in which
    // case the effect below is framing their tree instead.
    if (selectedId) return;
    // Instant, not animated: the opening view has nothing to animate from, and
    // an animated camera move this early is dropped before it starts.
    frame([...graph.layout.positions.values()], 0, 1, 0);
  }, [canvasReady, paneWidth, selectedId, graph.layout.positions, frame]);

  React.useEffect(() => {
    if (!canvasReady || !paneWidth || !paneHeight) return;
    // One person's tree, or the connection between two.
    const framedKey = path
      ? `${path.people[0]}~${path.people[path.people.length - 1]}`
      : selectedId;
    if (!framedKey || !spotlight) {
      if (!framedRef.current) return;
      framedRef.current = null;
      // Back out to the whole tree, never magnified past life size — and on
      // the same delay as the way in, for the same reason.
      const spots = [...graph.layout.positions.values()];
      const timer = setTimeout(() => frame(spots, 0, 1), 120);
      return () => clearTimeout(timer);
    }
    if (framedRef.current === framedKey) return;
    framedRef.current = framedKey;

    // The details sheet covers the right of a wide canvas, so frame the tree
    // in what is left of it. On a narrow screen the sheet covers everything
    // and there is nothing to aim around; on a middling one it is never given
    // more than a third of the canvas, or the strip left over is too thin to
    // put a family in.
    const panel =
      selectedId && paneWidth >= 640 ? Math.min(448, paneWidth / 3) : 0;
    const spots = pulled
      ? [...spotlight.people].flatMap((id) => {
          const spot = pulled.get(id);
          return spot ? [spot] : [];
        })
      : [];
    // Aimed a beat after the cards have moved, not with them. Selecting a
    // person changes every card's position and re-measures the ones that just
    // became leaves; the canvas responds by re-applying its own transform,
    // which cancels an animated camera move that is already in flight. Letting
    // that settle first is the difference between the camera arriving and the
    // camera never leaving.
    const alone = graph.layout.positions.get(spotlight.anchorId);
    const target = spots.length > 0 ? spots : alone ? [alone] : [];
    if (target.length === 0) return;
    const timer = setTimeout(() => frame(target, panel, 1.15), 120);
    return () => clearTimeout(timer);
  }, [
    canvasReady,
    path,
    selectedId,
    spotlight,
    pulled,
    paneWidth,
    paneHeight,
    graph.layout.positions,
    frame,
  ]);

  const onNodeClick = React.useCallback<NodeMouseHandler>((_, node) => {
    setSelectedEdgeId(null);
    setConnectionEnds(NO_CONNECTION);
    setSearchedId(null);
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
  // card keeps its offset as the tree grows instead of freezing in place. A
  // refused move says why and puts the card back where the tree last had it —
  // its seeded position, saved nudges included — rather than leaving it where
  // it was dropped as though the move had stuck.
  const onNodeDragStop = React.useCallback<OnNodeDrag>(
    (_, node) => {
      const refused = (res: { error?: string }) => {
        if (!res.error) return;
        toast.error(res.error);
        const home = graph.nodes.find((n) => n.id === node.id)?.position;
        if (!home) return;
        setNodes((ns) =>
          ns.map((n) => (n.id === node.id ? { ...n, position: home } : n)),
        );
      };
      if (node.type === "pet") {
        const spot = graph.petPositions.get(node.id);
        if (!spot) return;
        void setPetPosition(
          node.id,
          node.position.x - spot.x,
          node.position.y - spot.y,
        ).then(refused);
        return;
      }
      if (node.type !== "person") return;
      const auto = graph.layout.autoPositions.get(node.id);
      if (!auto) return;
      void setPersonPosition(
        treeId,
        node.id,
        node.position.x - auto.x,
        node.position.y - auto.y,
      ).then(refused);
    },
    [graph, setNodes, treeId],
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

  // What the lit connection is called, for the pill under it.
  const pathSummary = React.useMemo(() => {
    if (!path) return null;
    const [first, last] = [path.people[0], path.people[path.people.length - 1]];
    const [step] = path.steps;
    // Only the canvas's own edges know a marriage has ended.
    const divorced =
      path.steps.length === 1 &&
      step.kind === "spouse" &&
      relationships.some(
        (r) =>
          r.type === "spouse" &&
          r.is_divorced &&
          ((r.from_person === first && r.to_person === last) ||
            (r.from_person === last && r.to_person === first)),
      );
    return {
      from: nameById.get(first) ?? "",
      to: nameById.get(last) ?? "",
      label: divorced
        ? "Former spouses"
        : connectionLabel(path, relationships, (id) => personById.get(id)?.sex),
    };
  }, [path, relationships, nameById, personById]);

  // Offered in a searched-for person's details: light the line from them to
  // somebody else. Refused here, with the reason, when nothing joins the two —
  // the details sheet has nowhere to show an empty connection.
  const connectFromSelected = (toId: string) => {
    if (!selectedId) return;
    if (!connectionPath(selectedId, toId, relationships)) {
      toast.info(
        `Nothing on the tree joins ${nameById.get(selectedId) ?? "them"} and ${nameById.get(toId) ?? "them"} yet.`,
      );
      return;
    }
    onConnectionChange({ from: selectedId, to: toId });
  };
  // The selected person, by the name the Add button and the connection prompt
  // call them.
  const selectedTarget = selectedPerson
    ? {
        id: selectedPerson.id,
        name:
          selectedPerson.preferred_name ||
          selectedPerson.first_name ||
          personDisplayName(selectedPerson),
      }
    : null;
  // Whose relative the Add button adds (Step 19.2): whoever is selected, as
  // long as the viewer may add from them — a Leaf, only on their own line.
  const addTarget =
    selectedTarget && canAddRelativeOf(selectedTarget.id, viewer)
      ? selectedTarget
      : null;
  const selectedPet = allPets.find((pet) => pet.id === selectedPetId) ?? null;

  const peopleOptions = React.useMemo(
    () => people.map((p) => ({ id: p.id, label: personDisplayName(p) })),
    [people],
  );

  // A companion is editable by whoever added it, an admin, or anyone who can
  // already edit one of its people — looser than a person entry on purpose.
  const canEditPet =
    !!selectedPet && canEditCompanion(selectedPet, viewer, canEditPersonId);

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
            canEdit: canEditConnection(r, viewer),
          },
        ];
      });
  }, [selectedId, relationships, people, viewer]);
  const canEdit =
    !!selectedPerson && canEditEntry(entrySubject(selectedPerson), viewer);
  const canSeeDocs =
    !!selectedPerson && canSeeDocuments(entrySubject(selectedPerson), viewer);
  const canInvite =
    !!selectedPerson && canInviteToClaim(entrySubject(selectedPerson), viewer);
  const canDelete =
    !!selectedPerson && canOfferDelete(entrySubject(selectedPerson), viewer);
  const selectedInvites = React.useMemo(
    () =>
      selectedId && !readOnly
        ? claimInvites.filter((i) => i.personId === selectedId)
        : NO_INVITES,
    [claimInvites, selectedId, readOnly],
  );

  return (
    <>
      <ReactFlow
        className={cn(pulled && "tree-pulled")}
        nodes={displayNodes}
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
          setConnectionEnds(NO_CONNECTION);
        }}
        colorMode={colorMode}
        // The opening view is framed by `frame` below, not by React Flow's own
        // `fitView`: that one runs when the cards are first measured, and a
        // card changing shape re-measures it, so it would re-fire in the
        // middle of a pull-out and yank the camera back off the tree the
        // reader just opened.
        minZoom={0.15}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        // A card that has been pulled out of the tree is not where the reader
        // put it, so dragging is off until the spotlight closes.
        nodesDraggable={!readOnly && !spotlight}
      >
        <ViewportPortal>
          {graph.layout.bands.map((band) => (
            <GenerationLane
              key={band.generation}
              band={band}
              minX={graph.layout.extent.minX - 96}
              maxX={graph.layout.extent.maxX + 96}
              faded={!!spotlight}
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
          className={cn(
            "flex max-w-[45vw] flex-col items-end gap-2 sm:max-w-none",
            // Beside the details sheet rather than under it (Step 19.2) — a
            // person's, or a companion's since it stopped being modal. The
            // sheet renders 24rem wide from `sm` up (its base `max-w-sm` wins
            // over the panel's `max-w-md`); below that it covers the canvas
            // and carries its own Add button.
            (selectedPerson || selectedPet) && "sm:!mr-[calc(24rem+15px)]",
          )}
        >
          {readOnly ? (
            <div className="flex max-w-[15rem] flex-col items-end gap-1.5 rounded-lg border border-border bg-card/95 p-3 text-right shadow-md">
              <span className="text-xs text-muted-foreground">
                You&rsquo;re viewing a read-only copy of this family tree.
              </span>
              {/* In a dialog over the canvas, so asking keeps their place
                  (Step 41.4). An action here, not a way to another page,
                  so sentence case (docs/design-system.md). */}
              <RequestInviteDialog
                treeSlug={treeSlug}
                signedIn={currentUserId !== ""}
                size="sm"
              >
                Ask to join
              </RequestInviteDialog>
            </div>
          ) : (
            <AddRelativeButton
              relatedTo={addTarget}
              labelFrom={selectedPerson ? "lg" : "sm"}
            />
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
        </Panel>
        {path && pathSummary ? (
          <Panel
            position="bottom-center"
            className="w-[min(34rem,calc(100%-7rem))]"
          >
            <div
              className="mx-auto flex w-fit max-w-full items-center gap-3 rounded-2xl border bg-card px-4 py-2 text-sm shadow-md"
              style={{
                borderColor: `color-mix(in srgb, ${SPOTLIGHT_BROWN} 33%, transparent)`,
              }}
            >
              <span aria-hidden style={{ color: SPOTLIGHT_GREEN }}>
                🌿
              </span>
              {/* Stacked, so a long name for the connection wraps under the
                  two people rather than being cut off beside them. */}
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-foreground">
                  {pathSummary.from}
                  <span className="mx-1.5 text-muted-foreground/50">↔</span>
                  {pathSummary.to}
                </span>
                <span className="text-xs text-muted-foreground">
                  {pathSummary.label}
                </span>
              </span>
              <button
                type="button"
                className="text-muted-foreground/60 hover:text-foreground"
                onClick={() => setConnectionEnds(NO_CONNECTION)}
                aria-label="Show the whole tree again"
              >
                ✕
              </button>
            </div>
          </Panel>
        ) : spotlight && selectedPerson ? (
          <Panel
            position="bottom-center"
            className="flex flex-col items-center gap-1.5"
          >
            <div
              className="flex items-center gap-3 rounded-full border bg-card px-4 py-2 text-sm shadow-md"
              style={{
                borderColor: `color-mix(in srgb, ${SPOTLIGHT_BROWN} 33%, transparent)`,
              }}
            >
              <span aria-hidden style={{ color: SPOTLIGHT_GREEN }}>
                🌿
              </span>
              <span className="font-medium text-foreground">
                {personDisplayName(selectedPerson)}&rsquo;s tree
              </span>
              <span className="text-muted-foreground">
                {spotlight.ancestors}{" "}
                {spotlight.ancestors === 1 ? "ancestor" : "ancestors"}
                <span className="mx-1.5 text-muted-foreground/50">·</span>
                {spotlight.descendants}{" "}
                {spotlight.descendants === 1 ? "descendant" : "descendants"}
              </span>
              <button
                type="button"
                className="text-muted-foreground/60 hover:text-foreground"
                onClick={() => setSelectedId(null)}
                aria-label="Show the whole tree again"
              >
                ✕
              </button>
            </div>
            <span className="rounded-full bg-card/80 px-2 py-0.5 text-[11px] text-muted-foreground">
              Each leaf is a tree that grows where that person was born.
            </span>
          </Panel>
        ) : null}
        {/* The tip shares the pills' slot, so it steps aside while one shows. */}
        {!spotlight && !connection ? <CanvasTip /> : null}
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
            connection={connectionEnds}
            onConnectionChange={onConnectionChange}
            connectionMissing={
              !!connectionEnds.from && !!connectionEnds.to && !path
            }
            showCompanions={showCompanions}
            onShowCompanionsChange={setShowCompanions}
          />
          {!readOnly && claimCandidates.length > 0 ? (
            <ClaimSuggestions
              candidates={claimCandidates}
              notes={claimNotes}
            />
          ) : null}
          {!readOnly && gettingStarted ? (
            <GettingStarted treeId={treeId} items={gettingStarted} />
          ) : null}
        </Panel>
      </ReactFlow>

      <PersonPanel
        // A hidden person's card is a blur to a visitor: nothing to open.
        person={selectedPerson?.blurred ? null : selectedPerson}
        treeId={treeId}
        pets={allPets.filter((pet) =>
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
        canSeeDocuments={canSeeDocs}
        canDelete={canDelete}
        canInviteToClaim={canInvite}
        claimInvites={selectedInvites}
        readOnly={readOnly}
        shareToken={shareToken}
        claimable={!!selectedPerson && claimableIds.has(selectedPerson.id)}
        claimNote={
          selectedPerson ? (claimNotes.get(selectedPerson.id) ?? null) : null
        }
        isCreator={selectedPerson?.created_by === currentUserId}
        currentUserId={currentUserId}
        addRelativeOf={addTarget}
        connectionPrompt={
          selectedPerson && selectedPerson.id === searchedId ? (
            <section className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <Route className="size-3.5 text-muted-foreground" />
                How is {selectedTarget?.name} connected to…
              </h2>
              <PersonPicker
                people={people}
                value={null}
                onChange={(id) => {
                  if (id) connectFromSelected(id);
                }}
                excludeId={selectedPerson.id}
                placeholder="Search a second person…"
                label={`Second person, to show their connection to ${selectedTarget?.name}`}
              />
              <p className="text-xs text-muted-foreground">
                Pick someone and the line between the two lights up on the
                tree.
              </p>
            </section>
          ) : null
        }
        onClose={() => setSelectedId(null)}
      />

      <PetPanel
        pet={selectedPet}
        treeId={treeId}
        people={peopleOptions}
        canEdit={canEditPet}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        readOnly={readOnly}
        shareToken={shareToken}
        onClose={() => setSelectedPetId(null)}
        onSelectPerson={selectPerson}
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
        <Button
          nativeButton={false}
          render={<Link href={onboardingHref()} />}
        >
          Add yourself
        </Button>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100dvh-3.5rem)] w-full">
      {props.visitorNote ? (
        <p
          role="note"
          className="absolute inset-x-0 top-0 z-30 border-b border-border bg-muted/90 px-4 py-1.5 text-center text-xs text-muted-foreground backdrop-blur"
        >
          {props.visitorNote}
        </p>
      ) : null}
      <ReactFlowProvider>
        <Canvas {...props} />
      </ReactFlowProvider>
    </div>
  );
}
