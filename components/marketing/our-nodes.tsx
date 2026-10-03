"use client";

import Image from "next/image";
import * as React from "react";

import { LeafCard } from "@/components/tree/leaf-card";
import { SPOTLIGHT_BROWN } from "@/components/tree/spotlight-colours";
import { marketingEntry } from "@/lib/marketing-entry";
import { nativeLeaf } from "@/lib/native-leaf";
import { COUPLE_GAP, NODE_H, NODE_W } from "@/lib/tree-dimensions";
import { cn } from "@/lib/utils";

/**
 * Raiya's and Aalim's leaves, as their own entries draw them, less the
 * birthdates Aalim asked to leave out (Step 111 follow-up). Raiya on the
 * left, as in Notion.
 */
const RAIYA = marketingEntry({
  id: "raiya",
  first: "Raiya",
  last: "Rattansi-Suleman",
  maiden: "Suleman",
  city: "Burnaby",
  country: "Canada",
  account: "admin",
});
const AALIM = marketingEntry({
  id: "aalim",
  first: "Aalim",
  middle: "Kanji Suleman",
  last: "Rattansi",
  maiden: null,
  city: "Scarborough",
  country: "Canada",
  account: "admin",
});

/** The wedding photo's card, hung under the couple's trunk. */
const PHOTO_W = 280;
/** `public/about-us/wedding.jpg` is 960 × 991. */
const PHOTO_H = Math.round((PHOTO_W * 991) / 960);
/** Room under the leaves for the account marks hung there. */
const TRUNK = 72;

const WIDTH = 2 * NODE_W + COUPLE_GAP;
const MID_X = WIDTH / 2;
const MID_Y = NODE_H / 2;
const PHOTO_TOP = NODE_H + TRUNK;
/** The caption: a name and two lines under it. */
const CAPTION_H = 76;
const HEIGHT = PHOTO_TOP + PHOTO_H + CAPTION_H;

/**
 * The about-us page's family (Step 111 follow-up): Raiya's and Aalim's
 * leaves joined as partners are on a spotlight, and from the middle of
 * that line a trunk down to their wedding, a card of its own with the
 * photo: "Rattansi-Suleman", born August 2026 in Vancouver. Drawn at its
 * full size where it fits and scaled down to the column where it doesn't
 * (a phone), shown once measured, as the Elevators tree is.
 */
export function OurNodes({ className }: { className?: string }) {
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

  return (
    <div
      ref={frame}
      className={cn("w-full", className)}
      style={{ height: HEIGHT * (scale ?? 1) }}
    >
      <div
        className={cn(
          "relative transition-opacity duration-700",
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
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width={WIDTH}
          height={HEIGHT}
          aria-hidden
          className="absolute inset-0"
        >
          <path
            d={`M ${NODE_W},${MID_Y} L ${NODE_W + COUPLE_GAP},${MID_Y} M ${MID_X},${MID_Y} L ${MID_X},${PHOTO_TOP}`}
            fill="none"
            stroke={SPOTLIGHT_BROWN}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </svg>
        {[RAIYA, AALIM].map((person, i) => (
          <div
            key={person.id}
            className="absolute top-0 hover:z-10"
            style={{ left: i * (NODE_W + COUPLE_GAP) }}
          >
            <LeafCard
              person={person}
              leaf={nativeLeaf(person)}
              selected={false}
              isSelf={false}
            />
          </div>
        ))}
        <figure
          className="absolute flex flex-col overflow-hidden rounded-xl border bg-card shadow-xl"
          style={{ left: MID_X - PHOTO_W / 2, top: PHOTO_TOP, width: PHOTO_W }}
        >
          <Image
            src="/about-us/wedding.jpg"
            alt="Raiya and Aalim at their wedding, reading a newspaper together"
            width={PHOTO_W}
            height={PHOTO_H}
            loading="eager"
            className="block"
          />
          <figcaption className="flex flex-col gap-0.5 px-3 py-2.5">
            <span className="text-sm leading-tight font-medium text-foreground">
              Rattansi-Suleman
            </span>
            <span className="text-xs text-muted-foreground">
              b. August 2026
            </span>
            <span className="text-xs text-muted-foreground">
              Vancouver, Canada
            </span>
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
