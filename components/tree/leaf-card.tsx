"use client";

import * as React from "react";

import { AccountTypeMark } from "@/components/account-type-badge";
import { SamePersonMark } from "@/components/tree/same-person";
import { TreeMarkDot, type CardMark } from "@/components/tree/tree-mark";
import { FitText } from "@/components/ui/fit-text";
import { cropStyle, parseCrop } from "@/lib/image-crop";
import { leafGeometry } from "@/lib/leaf-shapes";
import { leafLabel, type LeafShape, type NativeLeaf } from "@/lib/native-leaf";
import { asDayMonth, formatPartialDate } from "@/lib/partial-date";
import {
  maidenLine,
  nodeDisplayName,
  personDisplayName,
  personLifespan,
} from "@/lib/person-name";
import type { TreeGraphPerson } from "@/lib/tree";
import { cn } from "@/lib/utils";

/** The blade box overhangs the card by this much top and bottom. */
const OVERHANG = 19;

/**
 * Where a leaf's blade starts, in card pixels down from the top of its card:
 * negative when it stands above the card box, as a maple's lobes do. Read at
 * the middle of the leaf, where a descent line lands (`lib/leaf-shapes.ts`),
 * so a line stops just short of the blade and never lands on it or the name
 * inside it.
 */
export function bladeTop(shape: LeafShape): number {
  return leafGeometry(shape).top - OVERHANG;
}

/** Space between the lowest point of a leaf and the mark hung under it. */
const MARK_GAP = 6;

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
  withPhoto,
}: {
  person: TreeGraphPerson;
  leaf: NativeLeaf;
  /** Once the leaf has been hovered: the full photo loads only then
   *  (Step 87.5). */
  withPhoto: boolean;
}) {
  const born = formatPartialDate(
    person.date_of_birth,
    person.date_of_birth_precision,
    asDayMonth(person.birth_month, person.birth_day),
    person.date_of_birth_circa,
  );
  const died = formatPartialDate(
    person.date_of_death,
    person.date_of_death_precision,
    null,
    person.date_of_death_circa,
  );
  const birthplace =
    [person.city_of_birth, person.country_of_birth]
      .filter(Boolean)
      .join(", ") || null;
  const label = leafLabel(leaf);
  const maiden = maidenLine(person);

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
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          {withPhoto ? (
            <>
              {/* The card-sized copy until the full one lands. */}
              {person.photo_card_url ? (
                <img
                  src={person.photo_card_url}
                  alt=""
                  style={cropStyle(parseCrop(person.photo_crop))}
                  className="absolute inset-0 size-full object-cover"
                />
              ) : null}
              <img
                src={person.photo_url}
                alt={`Photo of ${personDisplayName(person)}`}
                style={cropStyle(parseCrop(person.photo_crop))}
                className="relative size-full object-cover"
              />
            </>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <p className="text-sm leading-tight font-medium text-foreground">
          {person.preferred_name || person.first_name}
          {person.last_name ? ` ${person.last_name}` : ""}
        </p>
        {maiden ? (
          <p className="text-xs text-muted-foreground">{maiden}</p>
        ) : null}
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
 * The leaf carries a name, a maiden name and a lifespan and nothing else — a
 * photo pressed into a blade fights the silhouette, and the shape is already
 * saying where this person came from. Everything else waits for the hover
 * card.
 */
export function LeafCard({
  person,
  leaf,
  selected,
  isSelf,
  yourSpouse = false,
  mark,
  same,
}: {
  person: TreeGraphPerson;
  leaf: NativeLeaf;
  selected: boolean;
  isSelf: boolean;
  /** On My Family Tree, the viewer's own spouse (Step 94.1), said where
   *  "You" is. */
  yourSpouse?: boolean;
  /** On My Family Tree, the mark of the tree it comes from (Step 92.2). */
  mark?: CardMark;
  /** On My Family Tree, "Same person as …?" (Step 92.4). */
  same?: string;
}) {
  // Each species' own leaf (Step 96), drawn and measured on first use.
  const geometry = leafGeometry(leaf.shape);
  const blade = geometry.blade;
  const lifespan = personLifespan(person);
  const maiden = maidenLine(person);
  // "You" has a line of its own, except beside a maiden name: there it
  // shares the years' line, so a leaf never runs past three.
  // "Your spouse" goes where "You" would (Step 97).
  const who = isSelf ? "You" : yourSpouse ? "Your spouse" : null;
  const youAlone = !!who && !maiden;
  const youWithYears = !!who && !!maiden;
  const threeLines =
    [youAlone, maiden, youWithYears || lifespan].filter(Boolean).length === 2;
  const deceased = person.is_deceased;
  // Where the marks hang under the leaf (below).
  const markTop = geometry.bottom - OVERHANG + MARK_GAP;
  // Ids have to be unique per card: two leaves sharing a clip path would clip
  // to whichever one the browser resolved last.
  const clipId = React.useId();
  const [previewed, setPreviewed] = React.useState(false);

  return (
    <div
      className="group/leaf relative h-28 w-52"
      onPointerEnter={previewed ? undefined : () => setPreviewed(true)}
    >
      {/* The blade overhangs the card box top and bottom, so the lobes that
          stick out of it are not clipped away. No shadow on a phone, where
          it is painted again on each frame of a pan (Step 87.7). */}
      <svg
        viewBox="0 0 208 150"
        className={cn(
          "absolute inset-x-0 -inset-y-[19px] overflow-visible transition-[filter] duration-300 phone:filter-none",
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
        {/* The species' own veins: lighter on a compound leaf, where several
            meet under the name. */}
        <g clipPath={`url(#${clipId})`} opacity={geometry.veinOpacity}>
          {geometry.veins.map((d) => (
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
          leaf. Card and blade box share a scale, so the blade's depth
          converts to card pixels by the overhang alone. */}
      {person.account_type ? (
        <AccountTypeMark
          typeKey={person.account_type}
          className="absolute left-1/2 size-5 -translate-x-1/2 rounded-full bg-card p-0.5"
          style={{ top: markTop }}
        />
      ) : null}
      {/* Its tree's mark on My Family Tree (Step 92.2), hung under the leaf
          with the account mark: left of it when there is one, centred
          when not, ringed in card colour as that is. */}
      {mark ? (
        <TreeMarkDot
          mark={mark}
          label={mark.name}
          className={cn(
            "absolute ring-[3px] ring-card",
            person.account_type
              ? "left-[calc(50%-26px)]"
              : "left-1/2 -translate-x-1/2",
          )}
          style={{ top: markTop + 5 }}
        />
      ) : null}
      {/* Another leaf may be them too (Step 92.4): right of the marks, as
          the tree mark sits left of them. */}
      {same ? (
        <SamePersonMark
          label={same}
          className={cn(
            "absolute ring-[3px] ring-card",
            person.account_type
              ? "left-[calc(50%+16px)]"
              : mark
                ? "left-[calc(50%+11px)]"
                : "left-1/2 -translate-x-1/2",
          )}
          style={{ top: markTop + 2 }}
        />
      ) : null}

      {/* At most three lines, under the name. Three hang from where two put
          the name rather than centring on it, or the name would rise into
          the gaps between the baobab's leaflets. */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-center pr-8",
          threeLines && "pt-3",
        )}
        style={{ paddingLeft: geometry.textLeft }}
      >
        <p
          className={cn(
            "truncate text-[13px] leading-[15px] font-medium",
            deceased ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {nodeDisplayName(person)}
        </p>
        {youAlone ? (
          <p className="truncate text-[11px] leading-3 font-medium text-primary">
            {who}
          </p>
        ) : null}
        {/* Stops 110px along, before the baobab's middle leaflet and the
            maple's end lobe narrow to their points; a long one shrinks to
            fit before it is cut short. */}
        {maiden ? (
          <p className="max-w-27.5">
            <FitText
              max={11}
              min={8.5}
              className="leading-3 text-muted-foreground"
            >
              {maiden}
            </FitText>
          </p>
        ) : null}
        {youWithYears || lifespan ? (
          <p className="truncate text-[11px] leading-3 text-muted-foreground">
            {youWithYears ? (
              <span className="font-medium text-primary">{who}</span>
            ) : null}
            {youWithYears && lifespan ? " · " : null}
            {lifespan}
          </p>
        ) : null}
      </div>

      <LeafDetail person={person} leaf={leaf} withPhoto={previewed} />
    </div>
  );
}
