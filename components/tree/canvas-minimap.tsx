"use client";

import * as React from "react";
import {
  Panel,
  useStore,
  useStoreApi,
  type Node,
  type ReactFlowState,
} from "@xyflow/react";
import { XYMinimap, type XYMinimapInstance } from "@xyflow/system";

import { NODE_H, NODE_W } from "@/lib/tree-dimensions";

/** The minimap's size on screen, React Flow's own. */
const WIDTH = 200;
const HEIGHT = 150;
/** Room round the drawing, in minimap pixels (React Flow's `offsetScale`). */
const INSET = 5;

type Box = { x: number; y: number; width: number; height: number };

/** Every card as one shape, and the box they fill, in canvas units. */
function drawCards(nodes: Node[]): { d: string; box: Box | null } {
  let d = "";
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    if (node.hidden) continue;
    const width = node.measured?.width ?? node.width ?? NODE_W;
    const height = node.measured?.height ?? node.height ?? NODE_H;
    const { x, y } = node.position;
    d += `M${x} ${y}h${width}v${height}h${-width}z`;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }
  return {
    d,
    box: d
      ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      : null,
  };
}

/**
 * The cards' box, grown to take in the part of the canvas on screen, the
 * way React Flow's minimap does so the window never leaves it — but grown in
 * steps of a quarter of the cards' longer side, so it changes a few times
 * over a long pan instead of on every frame.
 */
function framedBox(cards: Box, view: Box): Box {
  const step = Math.max(cards.width, cards.height, 1) / 4;
  const steps = (by: number) => Math.ceil(by / step) * step;
  const left = Math.min(cards.x, cards.x - steps(cards.x - view.x));
  const top = Math.min(cards.y, cards.y - steps(cards.y - view.y));
  const right = Math.max(
    cards.x + cards.width,
    cards.x + cards.width + steps(view.x + view.width - cards.x - cards.width),
  );
  const bottom = Math.max(
    cards.y + cards.height,
    cards.y +
      cards.height +
      steps(view.y + view.height - cards.y - cards.height),
  );
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The drawing's viewBox, centred in the minimap, and canvas units a pixel. */
function fit(box: Box): { viewBox: string; scale: number; outer: Box } {
  const scale = Math.max(box.width / WIDTH, box.height / HEIGHT);
  const inset = INSET * scale;
  const outer = {
    x: box.x - (WIDTH * scale - box.width) / 2 - inset,
    y: box.y - (HEIGHT * scale - box.height) / 2 - inset,
    width: WIDTH * scale + inset * 2,
    height: HEIGHT * scale + inset * 2,
  };
  return {
    viewBox: `${outer.x} ${outer.y} ${outer.width} ${outer.height}`,
    scale,
    outer,
  };
}

const viewOf = (s: ReactFlowState): Box => ({
  x: -s.transform[0] / s.transform[2],
  y: -s.transform[1] / s.transform[2],
  width: s.width / s.transform[2],
  height: s.height / s.transform[2],
});

/** The cards, drawn only when they move: never on a frame of a pan. */
const Cards = React.memo(function Cards({
  viewBox,
  d,
}: {
  viewBox: string;
  d: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      width={WIDTH}
      height={HEIGHT}
      className="react-flow__minimap-svg absolute inset-0"
      aria-hidden
    >
      <path
        d={d}
        className="react-flow__minimap-node"
        // Inline: the class's own fill (React Flow's grey) beats an attribute.
        style={{ fill: "var(--muted-foreground)", stroke: "none" }}
        shapeRendering="crispEdges"
      />
    </svg>
  );
});

/**
 * The canvas's minimap (Step 102), in place of React Flow's `<MiniMap>`,
 * which on each frame of a pan or zoom measured every card again and, with
 * the canvas reaching past them, moved its viewBox, so the browser laid out
 * all of its cards again (one rect each). Here the cards are a single path
 * in a viewBox that moves only in steps (`framedBox`), and each frame
 * changes nothing but the shade round the window, in an svg of its own.
 * Dragging it pans and the wheel zooms, by React Flow's own handler.
 */
export function CanvasMiniMap() {
  const store = useStoreApi();
  const nodes = useStore((s: ReactFlowState) => s.nodes);
  const cards = React.useMemo(() => drawCards(nodes), [nodes]);
  // The window's box only matters once it reaches past the cards, and then
  // in steps; the string compares by value, so a frame inside them draws
  // nothing.
  const framed = useStore(
    React.useCallback(
      (s: ReactFlowState) => {
        if (!cards.box) return "";
        const b = framedBox(cards.box, viewOf(s));
        return `${b.x} ${b.y} ${b.width} ${b.height}`;
      },
      [cards.box],
    ),
  );
  const view = useStore(
    React.useCallback((s: ReactFlowState) => {
      const v = viewOf(s);
      return `${v.x} ${v.y} ${v.width} ${v.height}`;
    }, []),
  );
  const box = React.useMemo(() => {
    const [x, y, width, height] = (framed || "0 0 0 0").split(" ").map(Number);
    return fit({ x, y, width, height });
  }, [framed]);

  // Drag to pan and wheel to zoom, wired as React Flow wires its own.
  const svgRef = React.useRef<SVGSVGElement>(null);
  const scaleRef = React.useRef(box.scale);
  React.useEffect(() => {
    scaleRef.current = box.scale;
  }, [box.scale]);
  const panZoom = useStore((s: ReactFlowState) => s.panZoom);
  const flowWidth = useStore((s: ReactFlowState) => s.width);
  const flowHeight = useStore((s: ReactFlowState) => s.height);
  const translateExtent = useStore((s: ReactFlowState) => s.translateExtent);
  const minimap = React.useRef<XYMinimapInstance | null>(null);
  React.useEffect(() => {
    if (!svgRef.current || !panZoom) return;
    minimap.current = XYMinimap({
      domNode: svgRef.current,
      panZoom,
      getTransform: () => store.getState().transform,
      getViewScale: () => scaleRef.current,
    });
    return () => {
      minimap.current?.destroy();
      minimap.current = null;
    };
  }, [panZoom, store]);
  React.useEffect(() => {
    minimap.current?.update({
      translateExtent,
      width: flowWidth,
      height: flowHeight,
      pannable: true,
      zoomable: true,
    });
  }, [panZoom, translateExtent, flowWidth, flowHeight]);

  if (!cards.box) return null;
  const [vx, vy, vw, vh] = view.split(" ").map(Number);
  const { outer } = box;
  return (
    <Panel
      position="bottom-right"
      className="react-flow__minimap !bg-card"
      style={{ width: WIDTH, height: HEIGHT }}
    >
      <Cards viewBox={box.viewBox} d={cards.d} />
      <svg
        ref={svgRef}
        viewBox={box.viewBox}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label="Mini map"
        className="react-flow__minimap-svg relative"
      >
        <path
          className="react-flow__minimap-mask"
          d={`M${outer.x} ${outer.y}h${outer.width}v${outer.height}h${-outer.width}z M${vx} ${vy}h${vw}v${vh}h${-vw}z`}
          style={{ fill: "var(--muted)", stroke: "none" }}
          fillRule="evenodd"
          pointerEvents="none"
        />
      </svg>
    </Panel>
  );
}
