"use client";

import * as React from "react";

import { cropStyle, parseCrop } from "@/lib/image-crop";
import { leafLabel, type LeafShape, type NativeLeaf } from "@/lib/native-leaf";
import {
  formatFullDate,
  nodeDisplayName,
  personDisplayName,
  personLifespan,
} from "@/lib/person-name";
import type { TreeGraphPerson } from "@/lib/tree";
import { cn } from "@/lib/utils";

/**
 * One leaflet of a compound leaf: a blade of `length` and half-width `width`,
 * radiating from (`cx`, `cy`) at `angle` degrees. Compound leaves are the only
 * shapes it is worth generating rather than drawing, because what makes them
 * read is the fan — five hand-written blades at five angles would be five
 * chances to get the symmetry slightly wrong.
 */
function leaflet(
  cx: number,
  cy: number,
  angle: number,
  length: number,
  width: number,
): string {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const at = (along: number, across: number) =>
    `${(cx + along * cos - across * sin).toFixed(1)},${(cy + along * sin + across * cos).toFixed(1)}`;
  return [
    `M${at(0, 0)}`,
    `C${at(length * 0.25, -width)} ${at(length * 0.7, -width * 0.9)} ${at(length, 0)}`,
    `C${at(length * 0.7, width * 0.9)} ${at(length * 0.25, width)} ${at(0, 0)}`,
    "Z",
  ].join(" ");
}

/** The baobab's hand of leaflets, spread from the top of the stem. */
const PALMATE = [
  [0, 178, 26],
  [-20, 152, 24],
  [20, 152, 24],
  [-42, 116, 20],
  [42, 116, 20],
]
  .map(([angle, length, width]) => leaflet(26, 75, angle, length, width))
  .join(" ");

/**
 * Leaf silhouettes, drawn in a 208 × 150 box.
 *
 * Each one lies on its side: the stem enters at the left, where the branch
 * from the previous generation arrives, and the tip points right. The box is
 * taller than the 208 × 112 card it stands in and overhangs it top and bottom,
 * which is what makes the shapes readable — a maple needs somewhere to put its
 * lobes, and pressing them into the height of a card turned it into a star.
 *
 * The band from y 55 to 95 is kept clear in every blade: that is where the
 * name and the lifespan sit, and a silhouette that closes over it is a leaf
 * you cannot read.
 */
const BLADES: Record<LeafShape, string> = {
  ovate:
    "M24,75 C30,36 74,16 122,22 C168,28 196,50 204,75 C196,100 168,122 122,128 C74,134 30,114 24,75 Z",
  elliptic: "M24,75 C64,26 150,26 204,75 C150,124 64,124 24,75 Z",
  cordate:
    "M42,75 C14,50 26,16 62,26 C88,33 104,20 140,28 C180,37 198,55 204,75 C198,95 180,113 140,122 C104,130 88,117 62,124 C26,134 14,100 42,75 Z",
  maple:
    "M24,75 C28,58 34,44 44,34 C56,44 66,52 82,56 C96,38 112,22 134,12 C140,30 146,44 156,56 C176,62 192,68 204,75 C192,82 176,88 156,94 C146,106 140,120 134,138 C112,128 96,112 82,94 C66,98 56,106 44,116 C34,106 28,92 24,75 Z",
  palmate: PALMATE,
  oak: "M24,75 C22,50 34,40 50,46 C62,50 60,26 80,30 C96,33 96,18 116,24 C134,29 138,16 154,30 C168,42 186,58 204,75 C186,92 168,108 154,120 C138,134 134,121 116,126 C96,132 96,117 80,120 C60,124 62,100 50,104 C34,110 22,100 24,75 Z",
  round:
    "M24,75 C24,38 60,20 110,20 C168,20 200,44 204,75 C200,106 168,130 110,130 C60,130 24,112 24,75 Z",
};

/** Midrib and side veins, in trunk brown, clipped to whichever blade. */
const VEINS = [
  "M28,75 L194,75",
  "M60,75 C76,58 96,44 116,38",
  "M60,75 C76,92 96,106 116,112",
  "M100,75 C114,62 132,52 152,46",
  "M100,75 C114,88 132,98 152,104",
  "M140,75 C152,66 168,60 182,58",
  "M140,75 C152,84 168,90 182,92",
];

const LEAF_GREEN = "#77B255";
const TRUNK_BROWN = "#A57939";

/**
 * The card that appears over a leaf while it is hovered: the photo the leaf
 * itself deliberately does without, and the few facts worth reading before
 * committing to opening the whole entry.
 */
function LeafDetail({
  person,
  leaf,
}: {
  person: TreeGraphPerson;
  leaf: NativeLeaf;
}) {
  const born = formatFullDate(person.date_of_birth);
  const died = formatFullDate(person.date_of_death);
  const birthplace =
    [person.city_of_birth, person.country_of_birth]
      .filter(Boolean)
      .join(", ") || null;
  const label = leafLabel(leaf);

  return (
    <div
      className={cn(
        "pointer-events-none absolute top-1/2 left-1/2 z-50 hidden w-60 -translate-x-1/2 -translate-y-1/2",
        "flex-col overflow-hidden rounded-xl border bg-popover shadow-xl group-hover/leaf:flex",
      )}
      style={{ borderColor: `${LEAF_GREEN}66` }}
    >
      {person.photo_url ? (
        <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
          <img
            src={person.photo_url}
            alt={`Photo of ${personDisplayName(person)}`}
            style={cropStyle(parseCrop(person.photo_crop))}
            className="size-full object-cover"
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <p className="text-sm leading-tight font-medium text-foreground">
          {person.preferred_name || person.first_name}
          {person.last_name ? ` ${person.last_name}` : ""}
        </p>
        {born ? (
          <p className="text-xs text-muted-foreground">b. {born}</p>
        ) : null}
        {died ? (
          <p className="text-xs text-muted-foreground">d. {died}</p>
        ) : null}
        {!born && !died && person.is_deceased ? (
          <p className="text-xs text-muted-foreground">Deceased</p>
        ) : null}
        {birthplace ? (
          <p className="text-xs text-muted-foreground">{birthplace}</p>
        ) : null}
        {/* Always say something about the leaf. A birthplace we have no tree
            for is worth admitting to — silence just reads as a bug. */}
        <p
          className="pt-1 text-[11px]"
          style={{ color: TRUNK_BROWN, opacity: label ? 1 : 0.65 }}
        >
          {label ??
            (birthplace
              ? "No native tree on record for this place"
              : "Birthplace not recorded")}
        </p>
      </div>
    </div>
  );
}

/**
 * One person's card while their tree is pulled out of the canvas: the same
 * 208 × 112 box every other card occupies, repainted as a leaf from a tree
 * that grows where they were born.
 *
 * The leaf carries a name and a lifespan and nothing else — a photo pressed
 * into a blade fights the silhouette, and the shape is already saying where
 * this person came from. Everything else waits for the hover card.
 */
export function LeafCard({
  person,
  leaf,
  selected,
  isSelf,
}: {
  person: TreeGraphPerson;
  leaf: NativeLeaf;
  selected: boolean;
  isSelf: boolean;
}) {
  // Total on purpose: a shape added to the table before it is drawn here used
  // to render `d={undefined}`, which is a card with no leaf on it at all.
  const blade = BLADES[leaf.shape] ?? BLADES.ovate;
  const lifespan = personLifespan(person);
  const deceased = person.is_deceased;
  // Ids have to be unique per card: two leaves sharing a clip path would clip
  // to whichever one the browser resolved last.
  const clipId = React.useId();

  return (
    <div className="group/leaf relative h-28 w-52">
      {/* The blade overhangs the card box top and bottom, so the lobes that
          stick out of it are not clipped away. */}
      <svg
        viewBox="0 0 208 150"
        className={cn(
          "absolute inset-x-0 -inset-y-[19px] overflow-visible transition-[filter] duration-300",
          selected
            ? "drop-shadow-[0_10px_22px_rgba(119,178,85,0.45)]"
            : "drop-shadow-[0_8px_18px_rgba(38,32,22,0.22)]",
        )}
        aria-hidden
      >
        <defs>
          <clipPath id={clipId}>
            <path d={blade} />
          </clipPath>
        </defs>
        {/* The stem, running out to meet the branch this leaf hangs off. */}
        <path
          d="M0,75 L46,75"
          stroke={TRUNK_BROWN}
          strokeWidth={selected ? 5 : 4}
          strokeLinecap="round"
          fill="none"
        />
        {/* Card colour first, so the text above it reads in either theme, then
            the green wash and the outline over it. */}
        <path d={blade} fill="var(--card)" />
        <path
          d={blade}
          fill={LEAF_GREEN}
          fillOpacity={selected ? 0.24 : 0.14}
        />
        <g clipPath={`url(#${clipId})`} opacity={0.35}>
          {VEINS.map((d) => (
            <path
              key={d}
              d={d}
              stroke={TRUNK_BROWN}
              strokeWidth={1}
              fill="none"
              strokeLinecap="round"
            />
          ))}
        </g>
        <path
          d={blade}
          fill="none"
          stroke={LEAF_GREEN}
          strokeWidth={selected ? 2.5 : 1.5}
          strokeDasharray={deceased ? "6 5" : undefined}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col justify-center pr-8 pl-13">
        <p
          className={cn(
            "flex items-center gap-1 truncate text-[13px] leading-tight font-medium",
            deceased ? "text-muted-foreground" : "text-foreground",
          )}
        >
          <span className="truncate">{nodeDisplayName(person)}</span>
          {person.verified_at ? (
            <span className="shrink-0 text-primary" aria-label="Verified">
              ✓
            </span>
          ) : null}
        </p>
        {isSelf ? (
          <p className="truncate text-[11px] font-medium text-primary">You</p>
        ) : null}
        {lifespan ? (
          <p className="truncate text-[11px] text-muted-foreground">
            {lifespan}
          </p>
        ) : null}
      </div>

      <LeafDetail person={person} leaf={leaf} />
    </div>
  );
}
