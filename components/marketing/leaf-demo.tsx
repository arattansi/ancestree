"use client";

import * as React from "react";

import {
  play,
  useOnScreen as useSeen,
  useReducedMotion,
  waiter,
} from "@/components/marketing/demo-play";
import { bladeTop, LeafCard } from "@/components/tree/leaf-card";
import { SPOTLIGHT_BROWN } from "@/components/tree/spotlight-colours";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addRelative,
  canRelate,
  demoLines,
  layoutDemo,
  RELATIONS,
  type DemoPerson,
  type Person,
  type Relation,
} from "@/lib/leaf-demo-layout";
import { marketingEntry } from "@/lib/marketing-entry";
import { nativeLeaf } from "@/lib/native-leaf";
import { cn } from "@/lib/utils";

/**
 * The /features demo (Step 112): the add-a-relative form's basic fields and
 * how the new person connects on the left, the leaves they make on the
 * right. On its own it plays through once: Rumi Baldwin is on the tree, and
 * it types in René (her partner), André (their child) and Frida (André's
 * sibling), the Elevators family (`lib/elevators-tree.ts`), each turning
 * into a leaf joined to the rest as a spotlight joins them. Then it stops
 * and draws an arrow to "try it yourself", which hands the form over (as
 * clicking into a field does): the visitor adds up to two people of their
 * own to that family, the tree shrinking to fit. Nothing typed leaves the
 * page: no server call, no storage, and the inputs have no names, so a
 * browser has nothing to remember them by.
 */

type Field = keyof Person;

const EMPTY: Person = { first: "", last: "", place: "" };

/** Who's on the tree before the loop starts. */
const ROOT: DemoPerson[] = [
  {
    id: "rumi",
    first: "Rumi",
    last: "Baldwin",
    place: "Balkh, Afghanistan",
    parents: [],
    partner: null,
    siblingOf: null,
  },
];

/** What the loop types in, in order: one of each relation. */
const STEPS: { id: string; person: Person; relation: Relation; of: string }[] =
  [
    {
      id: "rene",
      person: { first: "René", last: "Baldwin", place: "Touraine, France" },
      relation: "partner",
      of: "rumi",
    },
    {
      id: "andre",
      person: {
        first: "André",
        last: "Franklin",
        place: "Atlanta, United States",
      },
      relation: "child",
      of: "rumi",
    },
    {
      id: "frida",
      person: { first: "Frida", last: "Baldwin", place: "Coyoacán, Mexico" },
      relation: "sibling",
      of: "andre",
    },
  ];

/** The tree as the loop leaves it, which a visitor's turn starts from. */
const SAMPLE = STEPS.reduce(
  (people, s) => addRelative(people, s.person, s.id, s.relation, s.of),
  ROOT,
);

/** How many people a visitor may add. */
const YOURS = 2;

/** What the connect fields show before anything is picked. */
const DEFAULT_RELATION: Relation = "child";
const DEFAULT_OF = "rumi";

/** The tree's box when the sample is all there: the frame keeps its height. */
const SAMPLE_BOUNDS = layoutDemo(SAMPLE).bounds;

const leafOf = (p: Person) => nativeLeaf({ city_of_birth: p.place });
const named = (p: Person) => !!(p.first.trim() || p.last.trim());
const nameOf = (p: Person) => `${p.first} ${p.last}`.trim();

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

type Mode = "loop" | "try";
type Focus = Field | "relation" | "of";

type Demo = {
  mode: Mode;
  people: DemoPerson[];
  draft: Person;
  relation: Relation;
  of: string;
  /** The field the loop is filling in. */
  typing: Focus | null;
  /** The loop is pressing add. */
  pressing: boolean;
  /** The loop has played and stopped, pointing at "try it yourself". */
  finished: boolean;
  /** How many more people the visitor may add. */
  left: number;
  setDraft: (draft: Person) => void;
  setRelation: (relation: Relation) => void;
  setOf: (of: string) => void;
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
  const report = React.useCallback(
    (onScreen: boolean) => setOnScreen(part, onScreen),
    [part, setOnScreen],
  );
  useSeen(ref, report);
}

const DemoContext = React.createContext<Demo | null>(null);

function useDemo(): Demo {
  const demo = React.useContext(DemoContext);
  if (!demo) throw new Error("A leaf demo part outside <LeafDemo>");
  return demo;
}

/**
 * Holds the demo's state for its two halves, which sit in different
 * columns of the page (`LeafDemoForm`, `LeafDemoTree`), and plays the loop
 * while it's on screen. With reduced motion there is no loop: the sample
 * is there from the start.
 */
export function LeafDemo({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = React.useState<Mode>("loop");
  const [tree, setPeople] = React.useState<DemoPerson[]>(ROOT);
  const [draft, setDraft] = React.useState<Person>(EMPTY);
  const [relation, setRelationState] =
    React.useState<Relation>(DEFAULT_RELATION);
  const [of, setOf] = React.useState(DEFAULT_OF);
  const [typing, setTyping] = React.useState<Focus | null>(null);
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
  // With less motion, no loop: the sample as the loop would leave it.
  const people = reduced && mode === "loop" ? SAMPLE : tree;
  const finished = mode === "loop" && (reduced || ended);

  React.useEffect(() => {
    if (mode !== "loop" || reduced) return;
    let stopped = false;
    // Waits while the demo is scrolled out of view or its tab is hidden:
    // the loop picks up where it was left.
    const wait = waiter(
      () => onScreen.current.form || onScreen.current.tree,
      () => stopped,
    );
    const type = async (field: Field, text: string) => {
      setTyping(field);
      const chars = Array.from(text);
      for (let n = 1; n <= chars.length; n++) {
        setDraft((d) => ({ ...d, [field]: chars.slice(0, n).join("") }));
        await wait(field === "place" ? 55 : 80);
      }
      await wait(250);
    };
    // Once through, then it stops with the sample in place.
    play(async () => {
      setPeople(ROOT);
      setDraft(EMPTY);
      setRelationState(DEFAULT_RELATION);
      setOf(DEFAULT_OF);
      setEnded(false);
      await wait(900);
      for (const step of STEPS) {
        await type("first", step.person.first);
        await type("last", step.person.last);
        await type("place", step.person.place);
        setTyping("relation");
        await wait(350);
        setRelationState(step.relation);
        await wait(600);
        setTyping("of");
        await wait(350);
        setOf(step.of);
        await wait(600);
        setTyping(null);
        await wait(300);
        setPressing(true);
        await wait(180);
        setPressing(false);
        setPeople((p) =>
          addRelative(p, step.person, step.id, step.relation, step.of),
        );
        setDraft(EMPTY);
        setRelationState(DEFAULT_RELATION);
        setOf(DEFAULT_OF);
        await wait(1300);
      }
      setEnded(true);
    });
    return () => {
      stopped = true;
      setTyping(null);
      setPressing(false);
      setEnded(false);
    };
  }, [mode, reduced]);

  const resetForm = () => {
    setDraft(EMPTY);
    setRelationState(DEFAULT_RELATION);
    setOf(DEFAULT_OF);
  };
  const left = YOURS - (people.length - SAMPLE.length);

  const demo: Demo = {
    mode,
    people,
    draft,
    relation,
    of,
    typing,
    pressing,
    finished,
    left: mode === "try" ? left : YOURS,
    setDraft,
    setRelation: (next) => {
      setRelationState(next);
      // A partner only for someone without one.
      if (!canRelate(people, next, of)) {
        const free = people.find((p) => canRelate(people, next, p.id));
        if (free) setOf(free.id);
      }
    },
    setOf,
    firstFieldRef,
    setOnScreen,
    add: () => {
      if (
        mode !== "try" ||
        left <= 0 ||
        !draft.first.trim() ||
        !canRelate(people, relation, of)
      )
        return;
      setPeople((p) =>
        addRelative(p, draft, `yours-${p.length}`, relation, of),
      );
      resetForm();
      firstField.current?.focus();
    },
    tryIt: (focus) => {
      setMode("try");
      setPeople(SAMPLE);
      resetForm();
      if (focus) firstField.current?.focus();
    },
    startOver: () => {
      setPeople(SAMPLE);
      resetForm();
      firstField.current?.focus();
    },
    watch: () => {
      resetForm();
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

/** The loop's highlight on the field it's filling in. */
const FILLING = "border-ring ring-3 ring-ring/50";

/** A native select drawn as the app's inputs are. */
const SELECT = cn(
  "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-base transition-colors outline-none md:text-sm dark:bg-input/30",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
);

/**
 * The form's half: the add-a-relative form's basic fields, as the app
 * labels them, and how the new person connects: partner, child or sibling
 * of someone on the tree. While the loop runs the fields are its to fill
 * in; clicking into one, or "try it yourself", hands them over.
 */
export function LeafDemoForm() {
  const demo = useDemo();
  const { mode, draft, people, typing, pressing } = demo;
  const looping = mode === "loop";
  const done = !looping && demo.left <= 0;
  const id = React.useId();
  const box = React.useRef<HTMLDivElement>(null);
  useOnScreen(box, "form", demo.setOnScreen);
  const takeOver = looping ? () => demo.tryIt(false) : undefined;

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
                disabled={done}
                onFocus={takeOver}
                onChange={(e) =>
                  demo.setDraft({ ...draft, [field]: e.target.value })
                }
                className={cn(typing === field && FILLING)}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-relation`}>How they connect</Label>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <select
              id={`${id}-relation`}
              value={demo.relation}
              disabled={done}
              onPointerDown={takeOver}
              onFocus={takeOver}
              onChange={(e) => demo.setRelation(e.target.value as Relation)}
              className={cn(SELECT, typing === "relation" && FILLING)}
            >
              {RELATIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Who they're related to"
              value={demo.of}
              disabled={done}
              onPointerDown={takeOver}
              onFocus={takeOver}
              onChange={(e) => demo.setOf(e.target.value)}
              className={cn(SELECT, typing === "of" && FILLING)}
            >
              {people.map((p) => (
                <option
                  key={p.id}
                  value={p.id}
                  disabled={!canRelate(people, demo.relation, p.id)}
                >
                  {nameOf(p)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {done ? (
          <Button type="button" variant="outline" onClick={demo.startOver}>
            start over
          </Button>
        ) : (
          <Button
            type="submit"
            tabIndex={looping ? -1 : undefined}
            aria-hidden={looping || undefined}
            disabled={
              !looping &&
              (!draft.first.trim() ||
                !canRelate(people, demo.relation, demo.of))
            }
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
 * played, drawing itself in as a branch does: the shaft from the right,
 * then the head.
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

/** Leaves and the whole tree glide to where a new leaf puts them. */
const GLIDE = "duration-500 ease-out";

/**
 * The tree's half: everyone on it as their leaf, joined to the rest, and
 * the one being typed in pale where they'll go, its shape changing as the
 * birthplace names somewhere with a tree of its own. The frame keeps the
 * height the sample needs at the column's width; as the tree grows past
 * it, the leaves already there shrink so it all still fits.
 */
export function LeafDemoTree({ className }: { className?: string }) {
  const { people, draft, relation, of, left, setOnScreen } = useDemo();
  const frame = React.useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = React.useState<number | null>(null);

  React.useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setFrameWidth(el.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useOnScreen(frame, "tree", setOnScreen);

  const drafting =
    left > 0 &&
    Object.values(draft).some((v) => v.trim()) &&
    canRelate(people, relation, of);
  const shown = drafting
    ? addRelative(people, draft, "draft", relation, of)
    : people;
  const { cards, bounds } = layoutDemo(shown);
  const lines = demoLines(people, cards);
  const leafById = new Map(people.map((p) => [p.id, leafOf(p)]));
  const draftLeaf = leafOf(draft);
  const draftCard = cards.get("draft");

  const width = frameWidth ?? SAMPLE_BOUNDS.width;
  const height =
    SAMPLE_BOUNDS.height * Math.min(1, width / SAMPLE_BOUNDS.width);
  const scale = Math.min(1, width / bounds.width, height / bounds.height);
  const x = (width - bounds.width * scale) / 2 - bounds.left * scale;
  const y = -bounds.top * scale;

  return (
    <div
      ref={frame}
      role="img"
      aria-label={`Leaves for ${people.map(nameOf).join(", ")}`}
      className={cn("relative w-full", className)}
      style={{ height }}
    >
      <div
        className={cn(
          "absolute top-0 left-0 transition-[transform,opacity]",
          GLIDE,
          frameWidth === null && "opacity-0",
        )}
        style={{
          transformOrigin: "0 0",
          transform: `translate(${x}px, ${y}px) scale(${scale})`,
        }}
      >
        <svg
          width={1}
          height={1}
          aria-hidden
          className="absolute top-0 left-0 overflow-visible"
        >
          <g
            fill="none"
            stroke={SPOTLIGHT_BROWN}
            strokeWidth={3}
            strokeLinecap="round"
          >
            {[
              ...lines.couples,
              ...lines.branches.map(({ child, path }) =>
                path(bladeTop(leafById.get(child)!.shape)),
              ),
            ].map((d) => (
              <path
                key={d}
                d={d}
                pathLength={1}
                strokeDasharray={1}
                className="animate-[branch-draw_700ms_ease-out_both]"
              />
            ))}
            {lines.brackets.map((d) => (
              <path
                key={d}
                d={d}
                strokeDasharray="6 6"
                className="animate-[leaf-settle_450ms_ease-out_both]"
              />
            ))}
          </g>
        </svg>
        {people.map((p) => {
          const card = cards.get(p.id);
          if (!card) return null;
          return (
            <div
              key={p.id}
              className={cn(
                "absolute animate-[leaf-settle_450ms_ease-out_both] transition-[left,top] hover:z-10",
                GLIDE,
              )}
              style={{ left: card.x, top: card.y }}
            >
              <LeafCard
                person={entryOf(p, p.id)}
                leaf={leafById.get(p.id)!}
                selected={false}
                isSelf={false}
                label={named(p) ? undefined : ""}
              />
            </div>
          );
        })}
        {draftCard ? (
          <div
            // A new shape lands as a new leaf would.
            key={`draft-${draftLeaf.shape}`}
            className={cn(
              "pointer-events-none absolute animate-[leaf-settle_300ms_ease-out_both] opacity-60 transition-[left,top]",
              GLIDE,
            )}
            style={{ left: draftCard.x, top: draftCard.y }}
          >
            <LeafCard
              person={entryOf(draft, "draft")}
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
