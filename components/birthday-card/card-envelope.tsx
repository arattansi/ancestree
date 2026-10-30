"use client";

import * as React from "react";

import { leafGeometry, type LeafShape } from "@/lib/leaf-shapes";
import { cn } from "@/lib/utils";

/**
 * The envelope a birthday card comes in (Step 217, the look Aalim chose):
 * kraft paper tied both ways with twine, a bow at the middle and a tag with
 * the person's leaf and name. One end of the string sways to show it can be
 * pulled; pulled far enough, or untied with the button, the twine comes
 * off, the flap lifts and the card slides out, and `onOpened` runs. A
 * pull let go early snaps back. Reduced motion skips straight to the end.
 */

type Stage = "sealed" | "untying" | "opening";

/** How far a drag must go, in screen pixels, for the string to come undone. */
const PULL_PX = 90;

export function CardEnvelope({
  firstName,
  leaf,
  count,
  onOpened,
  scale = 1,
  onDark = false,
}: {
  firstName: string;
  leaf: LeafShape;
  /** Signatures inside, said on the card peeking out. */
  count: number;
  onOpened: () => void;
  /** Drawn larger on a wide screen. */
  scale?: number;
  /** Over the dimmed page, as a card opens: a light button. */
  onDark?: boolean;
}) {
  const [stage, setStage] = React.useState<Stage>("sealed");
  const [pull, setPull] = React.useState(0);
  const start = React.useRef<{ x: number; y: number } | null>(null);
  const timers = React.useRef<number[]>([]);
  const opened = React.useRef(onOpened);
  React.useEffect(() => {
    opened.current = onOpened;
  }, [onOpened]);
  React.useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const untie = React.useCallback(() => {
    if (stage !== "sealed") return;
    start.current = null;
    const quick = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quick) {
      opened.current();
      return;
    }
    setStage("untying");
    timers.current.push(
      window.setTimeout(() => setStage("opening"), 850),
      window.setTimeout(() => opened.current(), 2350),
    );
  }, [stage]);

  const tag = leafGeometry(leaf).blade;
  const bow = `translate(150 112) scale(${(1 - pull * 0.45).toFixed(3)}) translate(-150 -112)`;
  const drawn = `translate(${(pull * 12).toFixed(1)} ${(pull * 40).toFixed(1)})`;

  return (
    <div className="flex flex-col items-center gap-6">
      <div style={{ width: 300 * scale, height: 200 * scale + 30 * scale, paddingTop: 48 * scale }}>
        <div
          className="card-envelope relative origin-top-left"
          data-stage={stage === "sealed" ? (pull > 0 ? "pulling" : "idle") : stage}
          data-untied={stage === "sealed" ? undefined : ""}
          style={{ width: 300, height: 200, perspective: 900, transform: `scale(${scale})` }}
        >
          <div className="absolute inset-0 z-[1] rounded-md bg-kraft-deep" />
          <div className="card-inner absolute top-2.5 right-4 left-4 z-[2] flex h-44 flex-col items-center gap-1 rounded border border-kraft-line/50 bg-kraft-tag pt-5 text-foreground">
            <span className="text-base font-semibold">for {firstName}</span>
            <span className="text-xs text-muted-foreground">
              {count === 1 ? "1 signature" : `${count} signatures`}
            </span>
          </div>
          <svg className="absolute top-0 left-0 z-[3]" width="300" height="200" viewBox="0 0 300 200" aria-hidden>
            <path
              d="M0,44 L150,132 L300,44 L300,194 Q300,200 294,200 L6,200 Q0,200 0,194 Z"
              className="fill-kraft stroke-kraft-line"
            />
            <path d="M0,200 L128,120 M300,200 L172,120" fill="none" className="stroke-kraft-line" strokeOpacity={0.6} />
          </svg>
          <svg className="card-flap absolute top-0 left-0 z-[4]" width="300" height="128" viewBox="0 0 300 128" aria-hidden>
            <path d="M1,1 L299,1 L160,116 Q150,124 140,116 Z" className="fill-kraft-flap stroke-kraft-line" />
          </svg>
          <svg
            className="card-twine absolute top-0 left-0 z-[5] overflow-visible"
            width="300"
            height="200"
            viewBox="0 0 300 200"
            aria-hidden
          >
            <g className="card-band-v">
              <path d="M150,-2 L150,202" className="stroke-twine" strokeWidth={3.2} strokeLinecap="round" />
              <path d="M150,-2 L150,202" className="stroke-twine-fibre" strokeWidth={1.3} strokeDasharray="3 4" />
            </g>
            <g className="card-band-h">
              <path d="M-2,112 L302,112" className="stroke-twine" strokeWidth={3.2} strokeLinecap="round" />
              <path d="M-2,112 L302,112" className="stroke-twine-fibre" strokeWidth={1.3} strokeDasharray="3 4" />
            </g>
            <g className="card-tag">
              <path d="M150,112 L128,146" className="stroke-twine" strokeWidth={1.2} fill="none" />
              <g transform="translate(70,150) rotate(-12)">
                <rect x="0" y="0" width="66" height="38" rx="4" className="fill-kraft-tag stroke-kraft-line" />
                <circle cx="58" cy="8" r="2.6" className="fill-background stroke-kraft-line" />
                <g transform="translate(2,9) scale(0.14)">
                  <path d={tag} className="fill-brand-green stroke-canopy" strokeWidth={6} />
                </g>
                <text x="33" y="25" fontSize="11" fontWeight={600} className="fill-foreground">
                  {firstName.length > 6 ? `${firstName.slice(0, 5)}…` : firstName}
                </text>
              </g>
            </g>
            <g className="card-tails">
              <path d="M150,112 C144,126 136,140 126,152" className="stroke-twine" strokeWidth={3} strokeLinecap="round" fill="none" />
            </g>
            <g className="card-bow" transform={stage === "sealed" ? bow : undefined}>
              <path
                d="M150,112 C134,96 112,92 110,104 C108,116 130,120 150,112 Z M150,112 C166,96 188,92 190,104 C192,116 170,120 150,112 Z"
                fill="none"
                className="stroke-twine"
                strokeWidth={3.2}
                strokeLinejoin="round"
              />
              <ellipse cx="150" cy="112" rx="5.5" ry="4.5" className="fill-twine-knot" />
            </g>
            <g className="card-pull" transform={stage === "sealed" ? drawn : undefined}>
              <path d="M150,112 C158,128 168,142 178,154" className="stroke-twine" strokeWidth={3} strokeLinecap="round" fill="none" />
              <circle cx="178" cy="154" r="4.5" className="fill-twine-knot" />
              <circle
                cx="178"
                cy="154"
                r="22"
                fill="transparent"
                className={cn("touch-none", stage === "sealed" && "cursor-grab")}
                onPointerDown={(e) => {
                  if (stage !== "sealed") return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  start.current = { x: e.clientX, y: e.clientY };
                }}
                onPointerMove={(e) => {
                  if (!start.current) return;
                  const dx = e.clientX - start.current.x;
                  const dy = e.clientY - start.current.y;
                  const next = Math.max(0, Math.min(1, (dx * 0.3 + dy * 0.95) / PULL_PX));
                  setPull(next);
                  if (next >= 1) untie();
                }}
                onPointerUp={() => {
                  if (!start.current) return;
                  start.current = null;
                  if (pull >= 0.6) untie();
                  else setPull(0);
                }}
                onPointerCancel={() => {
                  start.current = null;
                  setPull(0);
                }}
              />
            </g>
          </svg>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={untie}
          disabled={stage !== "sealed"}
          className={cn(
            "h-11 rounded-lg px-5 text-[15px] font-semibold transition-opacity disabled:opacity-60",
            onDark ? "bg-white text-neutral-900" : "bg-primary text-primary-foreground",
          )}
        >
          untie the string
        </button>
        <span className={cn("text-[13px]", onDark ? "text-white/75" : "text-muted-foreground")}>
          or pull it
        </span>
      </div>
    </div>
  );
}
