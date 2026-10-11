"use client";

import * as React from "react";

import {
  NAV_APPLE,
  NAV_APPLE_SIZE,
  NAV_MENU_ARROW,
  NAV_MENU_LETTERS,
} from "@/lib/nav-apples";
import { NAV_TREE_SIZE } from "@/lib/nav-tree";
import { cn } from "@/lib/utils";

/** Set once the apples have fallen in this tab: they fall once a visit. */
const FALLEN_KEY = "ancestree:menu-apples-fallen";

/** Each apple leaves the tree this long after the one before it. */
const APPLE_STAGGER_MS = 260;
/** Ripen, wobble, fall, hop, and gone: one apple's whole life. */
const APPLE_MS = 1500;
/** Its letter starts to show as the apple hops back down. */
const LETTER_AT = 0.88;
const LETTER_MS = 320;
const SHAFT_MS = 320;
const HEAD_MS = 220;
/** Back again (from the app, or a second visit), menu and arrow fade in. */
const FADE_MS = 400;

const GRAVITY = "cubic-bezier(0.55, 0, 1, 0.45)";
const RIPEN = "cubic-bezier(0.34, 1.56, 0.64, 1)";

function fallenThisVisit(): boolean {
  try {
    return window.sessionStorage.getItem(FALLEN_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberFallen() {
  try {
    window.sessionStorage.setItem(FALLEN_KEY, "1");
  } catch {
    // Without storage they fall again next time: no harm.
  }
}

/**
 * **menu**, under the tree while it's held open (Step 140, `lib/nav-apples.ts`):
 * once the tree has grown, an apple ripens under a canopy word for each
 * letter, wobbles, falls, hops once where Aalim wrote the letter, and turns
 * into it, in the mark's apple red; then an arrow is drawn from **menu** up
 * towards the tree, its line brown and its head green.
 * Once a visit (this tab's session); after that, and for reduced motion,
 * **menu** and the arrow are simply there. A picture, so it's hidden from
 * assistive technology and lets every press through.
 *
 * `scale` is CSS pixels per pixel of the drawing; `after` is when the tree
 * has finished growing; `leaving` fades it as the words fly home.
 */
export function NavMenuApples({
  scale,
  after,
  leaving,
}: {
  scale: number;
  after: number;
  leaving: boolean;
}) {
  // Decided as it mounts, so a second run of the effect (React's strict
  // mode, in development) plays what the first would have.
  const [fall] = React.useState(() => !fallenThisVisit());
  const root = React.useRef<HTMLDivElement>(null);
  const apples = React.useRef<(HTMLSpanElement | null)[]>([]);
  const letters = React.useRef<(HTMLSpanElement | null)[]>([]);
  const shaft = React.useRef<SVGPathElement>(null);
  const head = React.useRef<SVGPathElement>(null);

  React.useLayoutEffect(() => {
    rememberFallen();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const running: Animation[] = [];
    const play = (
      el: Element | null,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ) => {
      if (el)
        running.push(el.animate(keyframes, { fill: "backwards", ...options }));
    };

    if (!fall) {
      play(root.current, [{ opacity: 0 }, { opacity: 1 }], {
        duration: FADE_MS,
        delay: after,
      });
      return () => running.forEach((a) => a.cancel());
    }

    NAV_MENU_LETTERS.forEach((letter, i) => {
      const start = after + i * APPLE_STAGGER_MS;
      // From where it hangs to where its letter sits: both by the apple's
      // middle, the letter's middle and the stem's top half an apple above.
      const dx = (letter.hang.x - (letter.x + letter.width / 2)) * scale;
      const dy =
        (letter.hang.y + NAV_APPLE_SIZE / 2 - (letter.y + letter.height / 2)) *
        scale;
      const at = (x: number, y: number, turn: number, size: number) =>
        `translate(${x}px, ${y}px) rotate(${turn}deg) scale(${size})`;
      const hop = -6 * scale;
      play(
        apples.current[i],
        [
          { offset: 0, opacity: 1, transform: at(dx, dy, 0, 0), easing: RIPEN },
          { offset: 0.16, transform: at(dx, dy, 0, 1) },
          { offset: 0.24, transform: at(dx, dy, -14, 1) },
          { offset: 0.32, transform: at(dx, dy, 10, 1) },
          { offset: 0.38, transform: at(dx, dy, 0, 1), easing: GRAVITY },
          { offset: 0.72, transform: at(0, 0, 18, 1), easing: "ease-out" },
          { offset: 0.8, transform: at(0, hop, 6, 1), easing: "ease-in" },
          { offset: 0.88, opacity: 1, transform: at(0, 0, 0, 1) },
          { offset: 1, opacity: 0, transform: at(0, 0, 0, 0.3) },
        ],
        { duration: APPLE_MS, delay: start },
      );
      play(
        letters.current[i],
        [
          { opacity: 0, transform: "scale(0.3)" },
          { opacity: 1, transform: "scale(1.15)", offset: 0.6 },
          { opacity: 1, transform: "scale(1)" },
        ],
        {
          duration: LETTER_MS,
          delay: start + APPLE_MS * LETTER_AT,
          easing: "ease-out",
        },
      );
    });

    const landed =
      after + (NAV_MENU_LETTERS.length - 1) * APPLE_STAGGER_MS + APPLE_MS;
    play(
      shaft.current,
      [
        { strokeDashoffset: 1, opacity: 0 },
        { opacity: 1, offset: 0.05 },
        { strokeDashoffset: 0, opacity: 1 },
      ],
      { duration: SHAFT_MS, delay: landed + 150, easing: "ease-in-out" },
    );
    play(
      head.current,
      [
        { strokeDashoffset: 1, opacity: 0 },
        { opacity: 1, offset: 0.05 },
        { strokeDashoffset: 0, opacity: 1 },
      ],
      { duration: HEAD_MS, delay: landed + 150 + SHAFT_MS, easing: "ease-out" },
    );
    return () => running.forEach((a) => a.cancel());
  }, [fall, after, scale]);

  return (
    <div
      ref={root}
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 text-brand-red transition-opacity duration-200",
        leaving && "opacity-0",
      )}
    >
      <svg
        viewBox={`0 0 ${NAV_TREE_SIZE.width} ${NAV_TREE_SIZE.height}`}
        className="absolute inset-0 size-full overflow-visible"
        fill="none"
        strokeWidth={NAV_MENU_ARROW.width}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Drawn along their length: a dash as long as the path. The line
            is the trunk's brown, the head the canopy's green. */}
        <path
          ref={shaft}
          d={NAV_MENU_ARROW.shaft}
          stroke="var(--brand-brown)"
          pathLength={1}
          strokeDasharray="1 1"
        />
        <path
          ref={head}
          d={NAV_MENU_ARROW.head}
          stroke="var(--brand-green)"
          pathLength={1}
          strokeDasharray="1 1"
        />
      </svg>
      {NAV_MENU_LETTERS.map((letter, i) => (
        <React.Fragment key={letter.char}>
          <span
            ref={(el) => {
              letters.current[i] = el;
            }}
            className="absolute block origin-bottom"
            style={{
              left: letter.x * scale,
              top: letter.y * scale,
              width: letter.width * scale,
              height: letter.height * scale,
            }}
          >
            <svg
              viewBox={`0 0 ${letter.width} ${letter.height}`}
              className="block size-full overflow-visible"
              fill="currentColor"
            >
              <path fillRule="evenodd" d={letter.d} />
            </svg>
          </span>
          {/* Where it lands, by its middle on the letter's; it starts up in
              the tree, and is gone once the letter shows. */}
          <span
            ref={(el) => {
              apples.current[i] = el;
            }}
            className="absolute block origin-[50%_15%] opacity-0"
            style={{
              left: (letter.x + letter.width / 2 - NAV_APPLE_SIZE / 2) * scale,
              top: (letter.y + letter.height / 2 - NAV_APPLE_SIZE / 2) * scale,
              width: NAV_APPLE_SIZE * scale,
              height: NAV_APPLE_SIZE * scale,
            }}
          >
            <svg
              viewBox={`0 0 ${NAV_APPLE.box} ${NAV_APPLE.box}`}
              className="block size-full overflow-visible"
            >
              <path d={NAV_APPLE.body} fill="currentColor" />
              <path
                d={NAV_APPLE.stem}
                fill="none"
                stroke="var(--brand-brown)"
                strokeWidth={1.2}
                strokeLinecap="round"
              />
              <path d={NAV_APPLE.leaf} fill="var(--brand-green)" />
            </svg>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
