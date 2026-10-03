"use client";

import * as React from "react";

import { bladeTop, LeafCard } from "@/components/tree/leaf-card";
import { SPOTLIGHT_BROWN } from "@/components/tree/spotlight-colours";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  descentGeometry,
  leafBranchPath,
  leafLandX,
  type CardRect,
} from "@/lib/edge-geometry";
import { marketingEntry } from "@/lib/marketing-entry";
import { nativeLeaf } from "@/lib/native-leaf";
import {
  COUPLE_GAP,
  GUTTER,
  NODE_H,
  NODE_W,
  ROW_H,
} from "@/lib/tree-dimensions";
import { cn } from "@/lib/utils";

/**
 * The /features demo (Step 112): the add-a-relative form's basic fields on
 * the left and the leaves they make on the right. On its own it plays
 * through once, typing the Elevators family's parents and two of their
 * children (`lib/elevators-tree.ts`) in one at a time, each turning into a
 * leaf as it's added and joined to the others as a spotlight joins them.
 * Then it stops with the family in place and draws an arrow to "try it
 * yourself", which hands the form over (as clicking into a field does).
 * Nothing typed leaves the page: no server call, no storage, and the
 * inputs have no names, so a browser has nothing to remember them by.
 */

type Person = { first: string; last: string; place: string };
type Field = keyof Person;

const EMPTY: Person = { first: "", last: "", place: "" };

/** The loop's family, in the order it adds them. */
const FAMILY: Person[] = [
  { first: "Rumi", last: "Baldwin", place: "Balkh, Afghanistan" },
  { first: "René", last: "Baldwin", place: "Touraine, France" },
  { first: "André", last: "Franklin", place: "Atlanta, United States" },
  { first: "Frida", last: "Baldwin", place: "Coyoacán, Mexico" },
];

/**
 * Where each leaf goes, in the order they're added: a couple, then their
 * two children on the row under them, either side of the couple's trunk.
 * Four is all the column has room for.
 */
const MID_X = NODE_W + COUPLE_GAP / 2;
const SLOTS: CardRect[] = [
  { x: 0, y: 0 },
  { x: NODE_W + COUPLE_GAP, y: 0 },
  { x: MID_X - GUTTER / 2 - NODE_W, y: ROW_H },
  { x: MID_X + GUTTER / 2, y: ROW_H },
].map((p) => ({ ...p, w: NODE_W, h: NODE_H }));
const ROOM = SLOTS.length;

/** Room around the leaves: blades overhang their boxes top and bottom. */
const PAD = { x: 8, top: 32, bottom: 24 };
const LEFT = Math.min(...SLOTS.map((s) => s.x)) - PAD.x;
const TOP = -PAD.top;
const WIDTH = Math.max(...SLOTS.map((s) => s.x + s.w)) + PAD.x - LEFT;
const HEIGHT = ROW_H + NODE_H + PAD.bottom - TOP;

/** The children's trunk, from the couple down to the bar over their row. */
const DESCENT = descentGeometry([SLOTS[0], SLOTS[1]], ROW_H, { leafy: true });
const LAND_XS = [SLOTS[2], SLOTS[3]].map(leafLandX);

const leafOf = (p: Person) => nativeLeaf({ city_of_birth: p.place });

function entryOf(p: Person, id: string) {
  return marketingEntry({
    id,
    first: p.first.trim(),
    last: p.last.trim(),
    maiden: null,
    city: p.place.trim(),
    country: "",
    account: null,
  });
}

/** The lines between the leaves placed so far, as a spotlight routes them. */
function linesFor(placed: Person[]): string[] {
  const lines: string[] = [];
  if (placed.length >= 2) {
    const y = NODE_H / 2;
    lines.push(`M ${NODE_W},${y} L ${NODE_W + COUPLE_GAP},${y}`);
  }
  if (DESCENT) {
    for (let i = 2; i < placed.length; i++) {
      lines.push(
        leafBranchPath(
          DESCENT,
          SLOTS[i],
          bladeTop(leafOf(placed[i]).shape),
          10,
          LAND_XS,
        ),
      );
    }
  }
  return lines;
}

/** How the next leaf will join the ones already there. */
function connectionFor(placed: Person[]): string {
  const first = (i: number) => placed[i]?.first.trim() || "them";
  switch (placed.length) {
    case 0:
      return "starts the tree";
    case 1:
      return `partner of ${first(0)}`;
    default:
      return `child of ${first(0)} and ${first(1)}`;
  }
}

type Mode = "loop" | "try";

type Demo = {
  mode: Mode;
  placed: Person[];
  draft: Person;
  /** The field the loop is typing into. */
  typing: Field | null;
  /** The loop is pressing add. */
  pressing: boolean;
  /** The loop has added its whole family and stopped, pointing at "try
   *  it yourself". */
  finished: boolean;
  setDraft: (draft: Person) => void;
  add: () => void;
  tryIt: (focus: boolean) => void;
  startOver: () => void;
  watch: () => void;
  /** The first name's input, which a visitor's turn starts in. */
  firstFieldRef: (el: HTMLInputElement | null) => void;
  /** Whether a half is on screen: the loop waits while neither is. */
  setOnScreen: (part: Part, onScreen: boolean) => void;
};

type Part = "form" | "tree";

/** Reports to the loop whether `ref`'s element is on screen. */
function useOnScreen(
  ref: React.RefObject<HTMLElement | null>,
  part: Part,
  setOnScreen: Demo["setOnScreen"],
) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) =>
      setOnScreen(part, entry.isIntersecting),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, part, setOnScreen]);
}

const DemoContext = React.createContext<Demo | null>(null);

function useDemo(): Demo {
  const demo = React.useContext(DemoContext);
  if (!demo) throw new Error("A leaf demo part outside <LeafDemo>");
  return demo;
}

class Stopped extends Error {}

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Whether the visitor asked for less motion; no on the server. */
function useReducedMotion(): boolean {
  return React.useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

/**
 * Holds the demo's state for its two halves, which sit in different
 * columns of the page (`LeafDemoForm`, `LeafDemoTree`), and runs the loop
 * while it's on screen. With reduced motion there is no loop: the whole
 * family is there from the start.
 */
export function LeafDemo({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = React.useState<Mode>("loop");
  const [added, setPlaced] = React.useState<Person[]>([]);
  const [draft, setDraft] = React.useState<Person>(EMPTY);
  const [typing, setTyping] = React.useState<Field | null>(null);
  const [pressing, setPressing] = React.useState(false);
  const [ended, setEnded] = React.useState(false);
  const firstField = React.useRef<HTMLInputElement>(null);
  const onScreen = React.useRef({ form: false, tree: false });
  const firstFieldRef = React.useCallback((el: HTMLInputElement | null) => {
    firstField.current = el;
  }, []);
  const setOnScreen = React.useCallback((part: Part, value: boolean) => {
    onScreen.current[part] = value;
  }, []);

  const reduced = useReducedMotion();
  // With less motion, no loop: the family as the loop would finish it.
  const placed = reduced && mode === "loop" ? FAMILY : added;
  const finished = mode === "loop" && (reduced || ended);

  React.useEffect(() => {
    if (mode !== "loop" || reduced) return;
    let stopped = false;
    // Waits `ms`, then for as long as the demo is scrolled out of view or
    // its tab is hidden: the loop picks up where it was left.
    const seen = () =>
      !document.hidden && (onScreen.current.form || onScreen.current.tree);
    const wait = async (ms: number) => {
      await new Promise((r) => setTimeout(r, ms));
      while (!stopped && !seen()) await new Promise((r) => setTimeout(r, 250));
      if (stopped) throw new Stopped();
    };
    const type = async (field: Field, text: string) => {
      setTyping(field);
      const chars = Array.from(text);
      for (let n = 1; n <= chars.length; n++) {
        setDraft((d) => ({ ...d, [field]: chars.slice(0, n).join("") }));
        await wait(field === "place" ? 55 : 80);
      }
      await wait(250);
    };
    // Once through, then it stops with the family in place.
    (async () => {
      setPlaced([]);
      setDraft(EMPTY);
      setEnded(false);
      await wait(700);
      for (const person of FAMILY) {
        await type("first", person.first);
        await type("last", person.last);
        await type("place", person.place);
        setTyping(null);
        await wait(450);
        setPressing(true);
        await wait(180);
        setPressing(false);
        setPlaced((p) => [...p, person]);
        setDraft(EMPTY);
        await wait(1100);
      }
      setEnded(true);
    })().catch((error) => {
      if (!(error instanceof Stopped)) throw error;
    });
    return () => {
      stopped = true;
      setTyping(null);
      setPressing(false);
      setEnded(false);
    };
  }, [mode, reduced]);

  const demo: Demo = {
    mode,
    placed,
    draft,
    typing,
    pressing,
    finished,
    setDraft,
    firstFieldRef,
    setOnScreen,
    add: () => {
      if (mode !== "try" || !draft.first.trim() || placed.length >= ROOM)
        return;
      setPlaced((p) => [...p, draft]);
      setDraft(EMPTY);
      firstField.current?.focus();
    },
    tryIt: (focus) => {
      setMode("try");
      setPlaced([]);
      setDraft(EMPTY);
      if (focus) firstField.current?.focus();
    },
    startOver: () => {
      setPlaced([]);
      setDraft(EMPTY);
      firstField.current?.focus();
    },
    watch: () => {
      setDraft(EMPTY);
      setMode("loop");
    },
  };

  return <DemoContext value={demo}>{children}</DemoContext>;
}

const FIELDS: { field: Field; label: string; placeholder?: string }[] = [
  { field: "first", label: "First name" },
  { field: "last", label: "Last name" },
  {
    field: "place",
    label: "Place of birth",
    placeholder: "Town, village, or country",
  },
];

/**
 * The form's half: the add-a-relative form's basic fields, as the app
 * labels them, with where the next leaf will hang. While the loop runs,
 * the fields are its to type in; clicking into one, or "try it yourself",
 * hands them over.
 */
export function LeafDemoForm() {
  const demo = useDemo();
  const { mode, draft, placed, typing, pressing } = demo;
  const looping = mode === "loop";
  const full = placed.length >= ROOM;
  const id = React.useId();
  const box = React.useRef<HTMLDivElement>(null);
  useOnScreen(box, "form", demo.setOnScreen);

  return (
    <div ref={box} className="flex flex-col gap-4">
      <form
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          demo.add();
        }}
        className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map(({ field, label, placeholder }) => (
            <div
              key={field}
              className={cn(
                "flex flex-col gap-2",
                field === "place" && "sm:col-span-2",
              )}
            >
              <Label htmlFor={`${id}-${field}`}>{label}</Label>
              <Input
                id={`${id}-${field}`}
                ref={field === "first" ? demo.firstFieldRef : undefined}
                value={draft[field]}
                placeholder={placeholder}
                maxLength={60}
                autoComplete="off"
                spellCheck={false}
                readOnly={looping}
                disabled={!looping && full}
                onFocus={looping ? () => demo.tryIt(false) : undefined}
                onChange={(e) =>
                  demo.setDraft({ ...draft, [field]: e.target.value })
                }
                className={cn(
                  typing === field && "border-ring ring-3 ring-ring/50",
                )}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm leading-none font-medium">Connect to</span>
          <span className="self-start rounded-full border border-brand-brown/30 px-2.5 py-0.5 text-xs text-muted-foreground">
            {full ? "the tree is full" : connectionFor(placed)}
          </span>
        </div>
        {full && !looping ? (
          <Button type="button" variant="outline" onClick={demo.startOver}>
            start over
          </Button>
        ) : (
          <Button
            type="submit"
            tabIndex={looping ? -1 : undefined}
            aria-hidden={looping || undefined}
            disabled={!looping && !draft.first.trim()}
            className={cn(pressing && "translate-y-px bg-primary/80")}
          >
            add relative
          </Button>
        )}
      </form>
      {looping ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="attention"
            onClick={() => demo.tryIt(true)}
          >
            try it yourself
          </Button>
          {demo.finished ? <TryArrow /> : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Nothing you type is saved.</span>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-xs"
            onClick={demo.watch}
          >
            Watch it again
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * A hand-drawn arrow pointing back at "try it yourself" once the loop has
 * finished its family, drawing itself in as a branch does: the shaft from
 * the right, then the head.
 */
function TryArrow() {
  return (
    <svg
      viewBox="0 0 96 48"
      className="h-12 w-24 shrink-0 overflow-visible"
      aria-hidden
    >
      <g
        fill="none"
        stroke={SPOTLIGHT_BROWN}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M 92 8 C 74 1, 50 4, 38 15 S 22 31, 6 30"
          pathLength={1}
          strokeDasharray={1}
          className="animate-[branch-draw_600ms_ease-out_both]"
        />
        <path
          d="M 17 21 L 6 30 L 18 37"
          pathLength={1}
          strokeDasharray={1}
          className="animate-[branch-draw_250ms_ease-out_550ms_both]"
        />
      </g>
    </svg>
  );
}

/**
 * The tree's half: each person added as their leaf, joined to the rest,
 * and the one being typed in still pale in the next place, its shape
 * changing as the birthplace names somewhere with a tree of its own. Drawn
 * at its full size where it fits and scaled down to the column where it
 * doesn't, as /about-us's family is.
 */
export function LeafDemoTree({ className }: { className?: string }) {
  const { placed, draft, setOnScreen } = useDemo();
  const frame = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState<number | null>(null);

  React.useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () =>
      setScale(Math.min(1, el.getBoundingClientRect().width / WIDTH));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useOnScreen(frame, "tree", setOnScreen);

  const drafting =
    placed.length < ROOM && Object.values(draft).some((v) => v.trim());
  const draftLeaf = leafOf(draft);
  const named = (p: Person) => !!(p.first.trim() || p.last.trim());

  return (
    <div
      ref={frame}
      role="img"
      aria-label={
        placed.length
          ? `Leaves for ${placed.map((p) => `${p.first} ${p.last}`.trim()).join(", ")}`
          : "An empty family tree"
      }
      className={cn("w-full", className)}
      style={{ height: HEIGHT * (scale ?? 1) }}
    >
      <div
        className={cn(
          "relative transition-opacity duration-500",
          scale === null && "opacity-0",
        )}
        style={{
          width: WIDTH,
          height: HEIGHT,
          transformOrigin: "0 0",
          transform: `scale(${scale ?? 1})`,
        }}
      >
        <svg
          viewBox={`${LEFT} ${TOP} ${WIDTH} ${HEIGHT}`}
          width={WIDTH}
          height={HEIGHT}
          aria-hidden
          className="absolute inset-0 overflow-visible"
        >
          {linesFor(placed).map((d) => (
            <path
              key={d}
              d={d}
              pathLength={1}
              fill="none"
              stroke={SPOTLIGHT_BROWN}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={1}
              className="animate-[branch-draw_700ms_ease-out_both]"
            />
          ))}
        </svg>
        {placed.map((p, i) => (
          <div
            key={i}
            className="absolute animate-[leaf-settle_450ms_ease-out_both] hover:z-10"
            style={{ left: SLOTS[i].x - LEFT, top: SLOTS[i].y - TOP }}
          >
            <LeafCard
              person={entryOf(p, `demo-${i}`)}
              leaf={leafOf(p)}
              selected={false}
              isSelf={false}
              label={named(p) ? undefined : ""}
            />
          </div>
        ))}
        {drafting ? (
          <div
            // A new shape lands as a new leaf would.
            key={draftLeaf.shape}
            className="pointer-events-none absolute animate-[leaf-settle_300ms_ease-out_both] opacity-60"
            style={{
              left: SLOTS[placed.length].x - LEFT,
              top: SLOTS[placed.length].y - TOP,
            }}
          >
            <LeafCard
              person={entryOf(draft, "demo-draft")}
              leaf={draftLeaf}
              selected={false}
              isSelf={false}
              quiet
              label={named(draft) ? undefined : ""}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
