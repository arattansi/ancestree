"use client";

import * as React from "react";
import {
  BaseEdge,
  Position,
  getSmoothStepPath,
  useStore,
  type EdgeProps,
  type ReactFlowState,
} from "@xyflow/react";

import {
  descentGeometry,
  descentRoute,
  lateralGeometry,
  roundedPolyline,
  siblingBracketPoints,
  leafBranchPath,
  trunkStep,
  type CardRect,
  type Descent,
  type Lateral,
} from "@/lib/edge-geometry";
import { NODE_H, NODE_W } from "@/lib/tree-dimensions";

/**
 * The canvas's lines (Step 77.6, moved out of `family-tree.tsx`): a descent
 * from a couple to each child, a marriage, and the bracket to a sibling who
 * shares no parent on the tree. Each routes from the live cards in the store,
 * so it follows them as they move.
 */

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

/** A module constant: a new object each render would re-mount every edge. */
export const edgeTypes = {
  descent: DescentEdge,
  spouse: SpouseEdge,
  siblingBracket: SiblingBracketEdge,
};
