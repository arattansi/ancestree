"use client";

import { SamePersonMark } from "@/components/tree/same-person";
import { TreeMarkDot, type CardMark } from "@/components/tree/tree-mark";
import {
  maidenLine,
  nodeDisplayName,
  personDisplayName,
} from "@/lib/person-name";
import type { TreeGraphPerson } from "@/lib/tree";
import { cn } from "@/lib/utils";

/**
 * Someone who married in, named and no more, in a small neutral pill: a
 * sibling's partner in a spotlight (Step 19.4), and on My Family Tree
 * everyone who married into the viewer's family (Step 94). A blood relative
 * is a card or a leaf and someone who married in is not, and the difference
 * is the shape before it is the colour — no blade, no green, no photo, no
 * hover card, no account mark. Clicking it opens them, as any card does.
 *
 * Sized to `PILL_W` × `PILL_H` in `lib/tree-layout.ts`, which packs it.
 */
export function PillCard({
  person,
  label,
  mark,
  same,
  selected = false,
}: {
  person: TreeGraphPerson;
  /** Who they are to the family: "Spouse of Karim", "Married in ·
   *  Co-parent with you". */
  label: string;
  /** On My Family Tree, the tree the card comes from (Step 92.2). */
  mark?: CardMark;
  /** On My Family Tree, "Same person as …?" (Step 92.4). */
  same?: string;
  selected?: boolean;
}) {
  // Someone who married in is who most often has a maiden name, and the
  // tooltip is the only place the pill has room for it.
  const maiden = maidenLine(person);
  const who = maiden
    ? `${personDisplayName(person)}, ${maiden}`
    : personDisplayName(person);
  return (
    // A real button so it takes focus; the click reaches the canvas's node
    // handler, which opens them. Enter and Space are turned into that click
    // here rather than left to the browser's activation, which not every
    // input path delivers to a button inside a canvas node.
    <button
      type="button"
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.currentTarget.click();
      }}
      title={[who, label, mark?.name, same].filter(Boolean).join(" · ")}
      aria-label={[who, label, mark?.name, same].filter(Boolean).join(", ")}
      className={cn(
        "relative flex h-9 w-[120px] items-center justify-center rounded-full border border-border bg-muted shadow-xs",
        // A mark takes room from the name, so it sits tight against it.
        mark ? "gap-1 pr-2.5 pl-2" : "gap-1.5 px-3",
        "text-[13px] font-medium text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        person.is_deceased && "border-dashed",
        selected && "border-ring text-foreground ring-2 ring-ring/40",
      )}
    >
      {mark ? <TreeMarkDot mark={mark} className="size-2" /> : null}
      <span className="truncate">{nodeDisplayName(person, 14)}</span>
      {/* Across from the mark, on the pill's shoulder: the card's foot is
          where it goes on a card, and a pill has none. */}
      {same ? (
        <SamePersonMark className="absolute -top-1.5 -right-1.5" />
      ) : null}
    </button>
  );
}
