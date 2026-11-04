"use client";

import * as React from "react";

import { CardLeaf } from "@/components/birthday-card/card-leaf";
import { EnvelopeMark } from "@/components/birthday-card/envelope-mark";
import { InkDrawing } from "@/components/birthday-card/ink-drawing";
import { useSamplePlay } from "@/components/marketing/demo-play";
import LOVE_MOMMA from "@/components/marketing/love-momma-ink.json";
import { WatchAgain } from "@/components/marketing/watch-again";
import { signedYourCard } from "@/lib/birthday-cards";
import type { InkStroke } from "@/lib/card-ink";
import type { LeafShape } from "@/lib/leaf-shapes";
import { nativeLeaf } from "@/lib/native-leaf";
import { cn } from "@/lib/utils";

/**
 * The /features "birthday-cards" sample (Step 219): your card as it opens
 * on the day (`card-opening.tsx`, small), the envelope first, its string
 * untied, then a page a signature with previous and next, as
 * `CardPages` draws them. Aalim's three, word for word: your momma signed
 * her name by hand, so "Love, Momma" writes itself out where her name
 * would be, as a hand-signed name does; then your cousin's boo, then your
 * poppa. It plays once, then offers **watch again**. Its buttons work as
 * the card's do: untie, previous, next, close back to the envelope; a
 * press while it plays takes it over, stopping it where it is.
 *
 * "Love, Momma" is ink as a card keeps it (`lib/card-ink.ts`), made from
 * the Hershey Script single-line font's strokes (via the `hersheytext`
 * package, MIT), smoothed, squeezed a little, timed as written and
 * pressed harder on the down-strokes, as a pencil writes.
 */

type Page = {
  id: string;
  name: string;
  /** What they are to you, under their name. */
  relation: string;
  leaf: LeafShape;
  message: string;
  /** Their name, signed by hand in its place, and what it reads. */
  signed?: { ink: InkStroke[]; reads: string };
};

const PAGES: Page[] = [
  {
    id: "momma",
    name: "Rumi Baldwin",
    relation: "your momma",
    leaf: nativeLeaf({ city_of_birth: "Balkh, Afghanistan" }).shape,
    message:
      "why am i celebrating YOU for your birthday. you should be thanking me!",
    signed: { ink: LOVE_MOMMA as InkStroke[], reads: "Love, Momma" },
  },
  {
    id: "boo",
    name: "Kong Lumumba",
    relation: "your cousin’s boo",
    leaf: nativeLeaf({ city_of_birth: "Onalua, Congo" }).shape,
    message:
      "happy birthday! i hope you liked your gift :) your cousin tried to get you a sweater 🙄",
  },
  {
    id: "poppa",
    name: "René Baldwin",
    relation: "your poppa",
    leaf: nativeLeaf({ city_of_birth: "Touraine, France" }).shape,
    message: "happy birthday, sweetie! listen to your momma!",
  },
];

const SIGNED = signedYourCard(PAGES.map((p) => p.name.split(" ")[0]));

/** A card's button, small, as `CardPages` draws them. */
const BUTTON =
  "h-6 rounded-md px-2.5 text-xs font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const PRIMARY = "bg-primary text-primary-foreground";
const SECONDARY = "border border-border bg-background disabled:opacity-40";

/** `turn`: its place in a `DemoQueue`. */
export function CardDemo({ turn }: { turn?: number }) {
  // The page open, or null while it's in its envelope.
  const [at, setAt] = React.useState<number | null>(null);
  const [pressing, setPressing] = React.useState(false);
  // Whether the visitor has turned a page themselves.
  const [moved, setMoved] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);

  const { reduced, ended, replay, hold } = useSamplePlay(
    box,
    async (wait) => {
      const press = async () => {
        setPressing(true);
        await wait(160);
        setPressing(false);
      };
      await wait(1100);
      await press();
      setAt(0);
      // Her name writes itself out (3.2 s at most), then it's read.
      await wait(5200);
      await press();
      setAt(1);
      await wait(4600);
      await press();
      setAt(2);
      await wait(2600);
    },
    () => {
      setAt(null);
      setPressing(false);
    },
    turn,
  );
  // Less motion: the page signed by hand, as it is, till a page is turned.
  const shown = reduced && !moved ? 0 : at;
  // A press: the visitor takes the card over from here.
  const turnTo = (page: number | null) => {
    hold();
    setPressing(false);
    setMoved(true);
    setAt(page);
  };

  return (
    <div
      ref={box}
      role="group"
      aria-label="Your birthday card opened on the day: your momma, your cousin’s boo and your poppa signed it, your momma her name by hand"
      className="min-h-[10.5rem] text-sm lg:h-[10.5rem]"
    >
      {/* A phone's narrower page wraps her message: a little taller there. */}
      <div className="flex h-48 flex-col gap-2 rounded-xl border bg-card p-2.5 shadow-sm lg:h-[10.5rem]">
        {shown === null ? (
          <Sealed pressing={pressing} onUntie={() => turnTo(0)} />
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-medium">
                your birthday card{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  · {PAGES.length} signatures
                </span>
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {shown + 1} of {PAGES.length}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-kraft-line/30 bg-cake-sponge text-foreground">
              <CardPage key={shown} page={PAGES[shown]} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => turnTo(shown - 1)}
                disabled={shown === 0}
                className={cn(BUTTON, SECONDARY)}
              >
                previous
              </button>
              {ended && !reduced ? <WatchAgain onClick={replay} /> : null}
              <button
                type="button"
                onClick={() =>
                  turnTo(shown === PAGES.length - 1 ? null : shown + 1)
                }
                className={cn(
                  BUTTON,
                  PRIMARY,
                  pressing && "translate-y-px opacity-80",
                )}
              >
                {shown === PAGES.length - 1 ? "close" : "next"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The day's first look: the envelope, tied, and who's signed. */
function Sealed({
  pressing,
  onUntie,
}: {
  pressing: boolean;
  onUntie: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <p className="font-semibold tracking-tight">happy birthday, André.</p>
      <EnvelopeMark className="h-[42px] w-[60px]" />
      <button
        type="button"
        onClick={onUntie}
        className={cn(
          BUTTON,
          PRIMARY,
          pressing && "translate-y-px opacity-80",
        )}
      >
        untie the string
      </button>
      <p className="text-xs text-muted-foreground">{SIGNED}</p>
    </div>
  );
}

/** One signature, as `CardPage` lays it out, small; a hand-signed name writes itself out. */
function CardPage({ page }: { page: Page }) {
  return (
    <article className="card-page-in flex h-full flex-col gap-1.5 p-2">
      <div className="flex items-center gap-2">
        <CardLeaf shape={page.leaf} className="h-[22px] w-[36px]" />
        <div className="flex min-w-0 flex-col">
          {page.signed ? (
            <InkDrawing
              box="sign"
              strokes={page.signed.ink}
              label={page.signed.reads}
              replay
              className="h-8 w-auto self-start"
            />
          ) : (
            <span className="leading-tight font-semibold">{page.name}</span>
          )}
          <span className="text-xs leading-tight text-muted-foreground">
            {page.relation}
          </span>
        </div>
      </div>
      <p className="text-xs leading-4">{page.message}</p>
    </article>
  );
}
