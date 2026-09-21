"use client";

import * as React from "react";

import { AccountTypeMark } from "@/components/account-type-badge";
import { cropStyle, parseCrop } from "@/lib/image-crop";
import { leafLabel, type LeafShape, type NativeLeaf } from "@/lib/native-leaf";
import { formatPartialDate } from "@/lib/partial-date";
import {
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
const LEAFLETS = [
  [0, 178, 26],
  [-20, 152, 24],
  [20, 152, 24],
  [-42, 116, 20],
  [42, 116, 20],
];

const PALMATE = LEAFLETS.map(([angle, length, width]) =>
  leaflet(26, 75, angle, length, width),
).join(" ");

/**
 * The baobab's veins: a midrib down each leaflet, fanning out from the stem,
 * so it has the same inner stem every other leaf has. They stop short of the
 * tips, like the other leaves' veins.
 */
const PALMATE_VEINS = LEAFLETS.map(([angle, length]) => {
  const rad = (angle * Math.PI) / 180;
  const reach = length * 0.85;
  return `M26,75 L${(26 + reach * Math.cos(rad)).toFixed(1)},${(75 + reach * Math.sin(rad)).toFixed(1)}`;
});

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
  // The leaf on the Canadian flag, on its side: the flag's own outline
  // (stem trimmed, since the stem is drawn separately) scaled so its breadth
  // overhangs the box like the other lobed leaves. A sugar maple is wider
  // than it is long, and the earlier hand-drawn star read as neither.
  maple:
    "M46.0,72.9 A4.37,4.37 0 0 0 50.5,67.8 L43.6,28.3 L58.3,33.6 A2.99,2.99 0 0 0 61.6,32.7 L96.7,-10.6 L101.2,-0.8 A2.99,2.99 0 0 0 104.9,0.8 L131.2,-7.8 L125.9,17.1 A2.99,2.99 0 0 0 127.7,20.5 L139.0,25.3 L118.1,44.8 A2.99,2.99 0 0 0 120.8,49.9 L169.1,40.5 L160.4,55.5 A2.99,2.99 0 0 0 161.7,59.7 L191.7,75.0 L161.7,90.3 A2.99,2.99 0 0 0 160.4,94.5 L169.1,109.5 L120.8,100.1 A2.99,2.99 0 0 0 118.1,105.2 L139.0,124.7 L127.7,129.5 A2.99,2.99 0 0 0 125.9,132.9 L131.2,157.8 L104.9,149.2 A2.99,2.99 0 0 0 101.2,150.8 L96.7,160.6 L61.6,117.3 A2.99,2.99 0 0 0 58.3,116.4 L43.6,121.7 L50.5,82.2 A4.37,4.37 0 0 0 46.0,77.1 Z",
  palmate: PALMATE,
  oak: "M24,75 C22,50 34,40 50,46 C62,50 60,26 80,30 C96,33 96,18 116,24 C134,29 138,16 154,30 C168,42 186,58 204,75 C186,92 168,108 154,120 C138,134 134,121 116,126 C96,132 96,117 80,120 C60,124 62,100 50,104 C34,110 22,100 24,75 Z",
  round:
    "M24,75 C24,38 60,20 110,20 C168,20 200,44 204,75 C200,106 168,130 110,130 C60,130 24,112 24,75 Z",
};

/**
 * How far down each blade reaches, in the same 208 × 150 box: the lowest point
 * of its outline, measured by sampling the paths above. Hangs the account mark
 * just under the leaf it belongs to rather than under the deepest one — an
 * elliptic blade stops 49 units above a maple's lowest lobe. Re-measure after
 * redrawing a blade.
 */
const BLADE_BOTTOM: Record<LeafShape, number> = {
  ovate: 129,
  elliptic: 112,
  cordate: 126,
  maple: 161,
  palmate: 153,
  oak: 128,
  round: 130,
};

/** The blade box overhangs the card by this much top and bottom. */
const OVERHANG = 19;

/**
 * Where a leaf's blade starts, in card pixels down from the top of its card:
 * negative when its lobes stand above the card box, as a maple's do. Every
 * blade is mirrored about the midrib at y 75, so its top is as far above the
 * midrib as its bottom is below. A descent line stops just short of this, so
 * it never lands on the blade or the name inside it.
 */
export function bladeTop(shape: LeafShape): number {
  return 150 - (BLADE_BOTTOM[shape] ?? BLADE_BOTTOM.ovate) - OVERHANG;
}

/** Space between the lowest point of a leaf and the mark hung under it. */
const MARK_GAP = 6;

/**
 * Midrib and side veins, in trunk brown, clipped to whichever blade. The
 * baobab's compound leaf has its own (`PALMATE_VEINS`): one midrib per
 * leaflet, since side veins off a single midrib would cut across its
 * leaflets rather than along them.
 */
const VEINS = [
  "M28,75 L194,75",
  "M60,75 C76,58 96,44 116,38",
  "M60,75 C76,92 96,106 116,112",
  "M100,75 C114,62 132,52 152,46",
  "M100,75 C114,88 132,98 152,104",
  "M140,75 C152,66 168,60 182,58",
  "M140,75 C152,84 168,90 182,92",
];

const LEAF_GREEN = "var(--brand-green)";
const TRUNK_BROWN = "var(--brand-brown)";

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
  const born = formatPartialDate(
    person.date_of_birth,
    person.date_of_birth_precision,
  );
  const died = formatPartialDate(
    person.date_of_death,
    person.date_of_death_precision,
  );
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
      style={{
        borderColor: `color-mix(in srgb, ${LEAF_GREEN} 40%, transparent)`,
      }}
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
            ? "drop-shadow-[0_10px_22px_color-mix(in_srgb,var(--brand-green)_45%,transparent)]"
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
        {/* The outline goes down first, at twice its width, and the fills
            over it: only the half outside the silhouette survives. A compound
            leaf is several overlapping leaflets, and drawn on top their
            outlines crossed the name; drawn underneath, it is one outline. */}
        <path
          d={blade}
          fill="none"
          stroke={LEAF_GREEN}
          strokeWidth={selected ? 5 : 3}
          strokeDasharray={deceased ? "6 5" : undefined}
          strokeLinejoin="round"
        />
        {/* Card colour, so the text above it reads in either theme, then the
            green wash. */}
        <path d={blade} fill="var(--card)" />
        <path
          d={blade}
          fill={LEAF_GREEN}
          fillOpacity={selected ? 0.24 : 0.14}
        />
        {/* The baobab's are a shade lighter: five of them meet under the
            name, where the other leaves have one. */}
        <g
          clipPath={`url(#${clipId})`}
          opacity={leaf.shape === "palmate" ? 0.25 : 0.35}
        >
          {(leaf.shape === "palmate" ? PALMATE_VEINS : VEINS).map((d) => (
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
      </svg>

      {/* Whose entry this is (Step 19.1): hung centred just under its own
          leaf, clear of the ✓ after the name. Card and blade box share a
          scale, so the blade's depth converts to card pixels by the overhang
          alone. */}
      {person.account_type ? (
        <AccountTypeMark
          typeKey={person.account_type}
          className="absolute left-1/2 size-5 -translate-x-1/2 rounded-full bg-card p-0.5"
          style={{
            top:
              (BLADE_BOTTOM[leaf.shape] ?? BLADE_BOTTOM.ovate) -
              OVERHANG +
              MARK_GAP,
          }}
        />
      ) : null}

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
