import type * as React from "react";

import { MEMBER_LABEL, MemberMark } from "@/components/logo-mark";
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
 * The key to My Family Tree (Steps 92.2, 94): every one of the viewer's
 * trees by its mark, in the order they joined, which is the order the marks
 * were handed out in; then the two shapes a person takes there, named
 * outright — a card for a direct relative, a pill for whoever married in —
 * and the mark that says someone has an account (Step 97.3).
 */
export function TreeKey({ trees }: { trees: FamilyViewTree[] }) {
  return (
    <div className="flex max-w-[45vw] flex-col gap-1.5 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs shadow-md sm:max-w-60">
      <ul aria-label="Your trees" className="flex flex-col gap-1">
        {trees.map((t) => (
          <li key={t.id} className="flex min-w-0 items-center gap-2">
            <TreeMarkDot mark={t.mark} />
            <span className="truncate text-foreground" title={t.name}>
              {t.name}
            </span>
          </li>
        ))}
      </ul>
      <ul
        aria-label="Who's who"
        className="flex flex-col gap-1 border-t border-border pt-1.5"
      >
        <li className="flex min-w-0 items-center gap-2">
          {/* A card in small: the corners a card has. */}
          <span
            aria-hidden
            className="inline-block h-2.5 w-3.5 shrink-0 rounded-[3px] border border-foreground/50 bg-card"
          />
          <span className="truncate text-foreground">Direct relative</span>
        </li>
        <li className="flex min-w-0 items-center gap-2">
          {/* A pill in small: round ends, the muted fill. */}
          <span
            aria-hidden
            className="inline-block h-2 w-3.5 shrink-0 rounded-full border border-muted-foreground/60 bg-muted"
          />
          <span className="truncate text-foreground">Married in</span>
        </li>
        <li className="flex min-w-0 items-center gap-2">
          {/* Its width matches the shapes' above, so the names line up. */}
          <span aria-hidden className="flex w-3.5 shrink-0 justify-center">
            <MemberMark className="size-3.5" />
          </span>
          <span className="truncate text-foreground">{MEMBER_LABEL}</span>
        </li>
      </ul>
    </div>
  );
}
