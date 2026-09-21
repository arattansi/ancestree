"use client";

import { nodeDisplayName, personDisplayName } from "@/lib/person-name";
import type { TreeGraphPerson } from "@/lib/tree";
import { cn } from "@/lib/utils";

/**
 * A sibling's partner in a spotlight (Step 19.4): name only, in a small
 * neutral pill. A blood sibling is a leaf and someone who married in is not,
 * and the difference is the shape before it is the colour — no blade, no
 * green, no photo, no hover card, no account mark. Clicking it moves the
 * spotlight to them, where they get a leaf of their own.
 *
 * Sized to `PILL_W` × `PILL_H` in `lib/tree-layout.ts`, which packs it.
 */
export function PillCard({
  person,
  spouseOf,
}: {
  person: TreeGraphPerson;
  /** The sibling's first name, for "Spouse of …". */
  spouseOf: string;
}) {
  const label = `Spouse of ${spouseOf}`;
  return (
    // A real button so it takes focus; the click reaches the canvas's node
    // handler, which moves the spotlight. Enter and Space are turned into
    // that click here rather than left to the browser's activation, which
    // not every input path delivers to a button inside a canvas node.
    <button
      type="button"
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.currentTarget.click();
      }}
      title={`${personDisplayName(person)} · ${label}`}
      aria-label={`${personDisplayName(person)}, ${label}`}
      className={cn(
        "flex h-9 w-[120px] items-center justify-center rounded-full border border-border bg-muted px-3 shadow-xs",
        "text-[13px] font-medium text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        person.is_deceased && "border-dashed",
      )}
    >
      <span className="truncate">{nodeDisplayName(person, 14)}</span>
    </button>
  );
}
