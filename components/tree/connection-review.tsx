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
      <p className="text-sm text-muted-foreground">Nothing to review.</p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Section title="Missing connections" items={high} onResolved={refresh} />
      <Section
        title="Worth checking"
        blurb="Could be a step-parent or half-sibling, so check before saying yes."
        items={medium}
        onResolved={refresh}
      />
      <Section
        title="Possible duplicates"
        blurb="Similar names in the same place on the tree."
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
  blurb?: string;
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
        {blurb ? <p className="text-sm text-muted-foreground">{blurb}</p> : null}
      </div>
      <ConnectionPromptList suggestions={items} onResolved={onResolved} />
    </section>
  );
}
