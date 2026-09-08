"use client";

import { useRouter } from "next/navigation";

import { ConnectionPromptList } from "@/components/tree/connection-prompts";
import type { PanelSuggestion } from "@/lib/connection-suggestions";

/**
 * The standing review queue. Everything the engine can infer from the tree as
 * it stands, strongest evidence first — including gaps left behind by adds that
 * happened weeks ago, which the add-time modal could never surface.
 */
export function ConnectionReview({
  high,
  medium,
  duplicates,
}: {
  high: PanelSuggestion[];
  medium: PanelSuggestion[];
  duplicates: PanelSuggestion[];
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  if (high.length + medium.length + duplicates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing to review. Every connection the tree implies is already
        recorded, or has been answered.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Missing connections"
        blurb="The tree already implies these. Each one has a single likely reading."
        items={high}
        onResolved={refresh}
      />
      <Section
        title="Worth checking"
        blurb="These have a plausible second reading — a step-parent, a half-sibling — so they're worth a look rather than a reflex yes."
        items={medium}
        onResolved={refresh}
      />
      <Section
        title="Possible duplicates"
        blurb="Two entries with similar names sitting in the same place in the tree. Confirming one flags it for an admin; nothing is merged automatically."
        items={duplicates}
        onResolved={refresh}
      />
    </div>
  );
}

function Section({
  title,
  blurb,
  items,
  onResolved,
}: {
  title: string;
  blurb: string;
  items: PanelSuggestion[];
  onResolved: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">
          {title}{" "}
          <span className="font-normal text-muted-foreground">
            ({items.length})
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">{blurb}</p>
      </div>
      <ConnectionPromptList suggestions={items} onResolved={onResolved} />
    </section>
  );
}
