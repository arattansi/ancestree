"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  ancestralLandsSentence,
  landsListParts,
  LANDS_UNAVAILABLE,
  NATIVE_LAND_URL,
  type AncestralLandsAnswer,
  type Territory,
} from "@/lib/native-land";

/**
 * This page's lookups, by place: held in memory while the page is open,
 * shown and never stored (Native Land Digital's terms, `lib/native-land.ts`).
 * One that failed is forgotten, so the next card to ask tries again.
 */
const lookups = new Map<number, Promise<AncestralLandsAnswer>>();

function lookUpPlace(placeId: number): Promise<AncestralLandsAnswer> {
  const known = lookups.get(placeId);
  if (known) return known;
  const pending = fetch(`/api/ancestral-lands?place=${placeId}`, {
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
function useAncestralLands(placeId: number | null): AncestralLandsAnswer | null {
  // Keyed by place, so a card opened on someone else never shows the last
  // person's lands while theirs load.
  const [state, setState] = React.useState<{
    placeId: number;
    answer: AncestralLandsAnswer;
  } | null>(null);

  React.useEffect(() => {
    if (placeId == null) return;
    let active = true;
    lookUpPlace(placeId).then((answer) => {
      if (active) setState({ placeId, answer });
    });
    return () => {
      active = false;
    };
  }, [placeId]);

  return placeId != null && state?.placeId === placeId ? state.answer : null;
}

/**
 * Under a place of birth or death on a card: the family's own words for whose
 * land it is or, when they haven't written any, the territories Native Land
 * Digital maps there, credited to NLD. `lookUp` is off on a share link, whose
 * viewer isn't signed in to ask; it shows only what the family wrote.
 */
export function AncestralLands({
  wording,
  placeId,
  lookUp,
}: {
  wording: string | null;
  placeId: number | null;
  lookUp: boolean;
}) {
  const answer = useAncestralLands(wording || !lookUp ? null : placeId);

  if (wording) {
    return <p className="text-xs text-muted-foreground">{wording}</p>;
  }
  const territories = answer?.territories ?? [];
  if (territories.length === 0) return null;
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
 * In the form, under the wording: what a card will say if it's left empty,
 * and a button to start from those names rather than a blank box.
 */
export function AncestralLandsSuggestion({
  placeId,
  onUse,
}: {
  placeId: number;
  onUse: (sentence: string) => void;
}) {
  const answer = useAncestralLands(placeId);
  if (!answer?.available) return null;

  const sentence = ancestralLandsSentence(answer.territories);
  if (!sentence) {
    return (
      <p className="text-xs text-muted-foreground">
        Native Land Digital has no territories mapped at this place.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <p>
        Left empty, the tree shows:{" "}
        <span className="text-foreground">{sentence}</span>
      </p>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto px-0 text-xs"
        onClick={() => onUse(sentence)}
      >
        Start from these names
      </Button>
      <NativeLandCredit />
    </div>
  );
}
