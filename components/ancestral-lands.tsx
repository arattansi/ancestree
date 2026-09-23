"use client";

import * as React from "react";

import {
  landsListParts,
  LANDS_UNAVAILABLE,
  NATIVE_LAND_URL,
  type AncestralLandsAnswer,
  type Territory,
} from "@/lib/native-land";
import { cn } from "@/lib/utils";

/**
 * This page's lookups, by place: held in memory while the page is open,
 * shown and never stored (Native Land Digital's terms, `lib/native-land.ts`).
 * One that failed is forgotten, so the next card to ask tries again.
 */
const lookups = new Map<number, Promise<AncestralLandsAnswer>>();

/**
 * Where a card asks: `/api/ancestral-lands` when the viewer is signed in (a
 * member, or a visitor from another tree), and the link's own route on a
 * share link, whose viewer isn't (Step 27.9).
 */
function lookUpUrl(placeId: number, shareToken: string | null): string {
  return shareToken
    ? `/shared/${encodeURIComponent(shareToken)}/ancestral-lands?place=${placeId}`
    : `/api/ancestral-lands?place=${placeId}`;
}

function lookUpPlace(
  placeId: number,
  shareToken: string | null,
): Promise<AncestralLandsAnswer> {
  const known = lookups.get(placeId);
  if (known) return known;
  const pending = fetch(lookUpUrl(placeId, shareToken), {
    cache: "no-store",
  })
    .then(async (res) => {
      if (!res.ok) return LANDS_UNAVAILABLE;
      const body = (await res.json()) as AncestralLandsAnswer;
      return Array.isArray(body?.territories) ? body : LANDS_UNAVAILABLE;
    })
    .catch(() => LANDS_UNAVAILABLE)
    .then((answer) => {
      if (!answer.available) lookups.delete(placeId);
      return answer;
    });
  lookups.set(placeId, pending);
  return pending;
}

/** The lookup for a place; null while it's on its way, or with no place. */
function useAncestralLands(
  placeId: number | null,
  shareToken: string | null = null,
): AncestralLandsAnswer | null {
  // Keyed by place, so a card opened on someone else never shows the last
  // person's lands while theirs load.
  const [state, setState] = React.useState<{
    placeId: number;
    answer: AncestralLandsAnswer;
  } | null>(null);

  React.useEffect(() => {
    if (placeId == null) return;
    let active = true;
    lookUpPlace(placeId, shareToken).then((answer) => {
      if (active) setState({ placeId, answer });
    });
    return () => {
      active = false;
    };
  }, [placeId, shareToken]);

  return placeId != null && state?.placeId === placeId ? state.answer : null;
}

/**
 * Under a place of birth or death on a card: the territories Native Land
 * Digital maps there, credited to NLD. Where NLD maps none, or can't be
 * asked, nothing at all (Step 40). Read-only trees ask too (27.9): a visitor
 * as themselves, a share link through `shareToken`.
 */
export function AncestralLands({
  placeId,
  shareToken = null,
}: {
  placeId: number | null;
  /** On a share link: its token, since the viewer isn't signed in to ask. */
  shareToken?: string | null;
}) {
  const territories = useAncestralLands(placeId, shareToken)?.territories;
  if (!territories?.length) return null;
  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      <p>
        Ancestral lands of <LandsList territories={territories} />
      </p>
      <NativeLandCredit />
    </div>
  );
}

/** "A, B, and C", each name linked to its page on native-land.ca. */
function LandsList({ territories }: { territories: Territory[] }) {
  const urlByName = new Map(territories.map((t) => [t.name, t.url]));
  return landsListParts(territories.map((t) => t.name)).map((part, i) => {
    const url = part.type === "name" ? urlByName.get(part.value) : null;
    return url ? (
      <a
        key={i}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-dotted underline-offset-2 hover:text-foreground"
      >
        {part.value}
      </a>
    ) : (
      <React.Fragment key={i}>{part.value}</React.Fragment>
    );
  });
}

/**
 * NLD's credit and, a tap away, the acknowledgement its terms ask of anyone
 * showing its data.
 */
function NativeLandCredit() {
  return (
    <details className="text-[11px] text-muted-foreground">
      <summary className="w-fit cursor-pointer">From Native Land Digital</summary>
      <p className="pt-1 leading-snug">
        Territory names come from{" "}
        <a
          href={NATIVE_LAND_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          Native Land Digital
        </a>
        , looked up each time and never saved. Indigenous communities are the
        rightful stewards of this knowledge, and the map isn&rsquo;t a legal or
        official record of boundaries.
      </p>
    </details>
  );
}

/**
 * A place's ancestral lands in a form, under the place they belong to, on a
 * person's form and a companion's: the territories Native Land Digital maps
 * there, as NLD gives them, with nothing to fill in. Where NLD maps none, or
 * can't be asked (a place added by hand has no coordinates), nothing at all,
 * and nothing while it's being asked, so a place with none never flashes up
 * a line that then goes (Step 40).
 */
export function AncestralLandsField({
  placeId,
  className,
}: {
  placeId: number;
  className?: string;
}) {
  const territories = useAncestralLands(placeId)?.territories;
  if (!territories?.length) return null;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="text-sm leading-none font-medium">Ancestral lands</p>
      <p className="text-sm">
        <LandsList territories={territories} />
      </p>
      <NativeLandCredit />
    </div>
  );
}
