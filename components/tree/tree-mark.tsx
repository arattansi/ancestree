import type * as React from "react";

import type { FamilyViewTree, TreeMark } from "@/lib/my-family";
import { cn } from "@/lib/utils";

/** A tree's mark as a card wears it: the mark, and the tree it stands for. */
export type CardMark = TreeMark & { name: string };

/**
 * A tree's mark on My Family Tree (Step 92.2, docs/design-system.md "Tree
 * marks"): a dot in its colour, or a ring of it for a member's third and
 * fourth trees. It never stands alone: the key names every tree, and so
 * does the details sheet. `label` names it for anyone who can't see it;
 * without one it's decoration beside the name it marks.
 */
export function TreeMarkDot({
  mark,
  label,
  className,
  style,
}: {
  mark: TreeMark;
  label?: string;
  className?: string;
  /** For placement worked out at render time, like a leaf's depth. */
  style?: React.CSSProperties;
}) {
  return (
    <span
      {...(label
        ? { role: "img", "aria-label": label, title: label }
        : { "aria-hidden": true })}
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{
        ...style,
        ...(mark.ring
          ? { border: `2px solid ${mark.colour}` }
          : { backgroundColor: mark.colour }),
      }}
    />
  );
}

/**
 * The key to the marks on My Family Tree's cards (Step 92.2): every one of
 * the viewer's trees, by name, in the order they joined, which is the order
 * the marks were handed out in.
 */
export function TreeKey({ trees }: { trees: FamilyViewTree[] }) {
  return (
    <ul
      aria-label="Your trees"
      className="flex max-w-[45vw] flex-col gap-1 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs shadow-md sm:max-w-60"
    >
      {trees.map((t) => (
        <li key={t.id} className="flex min-w-0 items-center gap-2">
          <TreeMarkDot mark={t.mark} />
          <span className="truncate text-foreground" title={t.name}>
            {t.name}
          </span>
        </li>
      ))}
    </ul>
  );
}
