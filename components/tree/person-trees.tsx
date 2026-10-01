"use client";

import { TreeTarget } from "@/components/tree-target";
import { TreeMarkDot } from "@/components/tree/tree-mark";
import { usePersonSheet } from "@/components/tree/use-person-sheet";
import type { FamilyViewTree } from "@/lib/my-family";
import { treeFocusHref } from "@/lib/tree-links";

/**
 * "Also on" (Step 25): the other trees this person is shown on that the
 * viewer may open — as a member, or as a visitor where that tree's Root has
 * opened it to this one. The way from one family's canvas to the next runs
 * through the people they share. Each link switches the browser to that
 * tree and opens it on this person.
 */
export function PersonTrees({
  personId,
  currentTreeId,
}: {
  personId: string;
  currentTreeId: string;
}) {
  // Read with the rest of the sheet (Step 87.6), keyed by person, so
  // switching cards never shows the last person's trees.
  const trees = usePersonSheet(personId)?.sheet.trees?.filter(
    (t) => t.id !== currentTreeId,
  );

  if (!trees || trees.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <span>Also on</span>
      {trees.map((t) => (
        // Another tree: busy until its canvas has arrived (Step 70), with
        // no remount of the page on the way (Step 77.3).
        <TreeTarget
          key={t.id}
          treeId={t.id}
          currentTreeId={currentTreeId}
          href={treeFocusHref(personId)}
          variant="link"
          size="xs"
          className="relative tap-target h-auto px-0 whitespace-normal text-foreground underline underline-offset-2"
        >
          {t.name}
          {t.visitor ? " (view only)" : ""}
        </TreeTarget>
      ))}
    </div>
  );
}

/**
 * On My Family Tree (Step 92.2): every one of the viewer's trees that shows
 * this person, by full name with its mark, as the key shows them. Each
 * opens that tree on this person, as "Also on" does.
 */
export function PersonOnTrees({
  personId,
  trees,
  currentTreeId,
}: {
  personId: string;
  trees: FamilyViewTree[];
  /** The tree the browser is looking at, which opens without a switch. */
  currentTreeId: string | null;
}) {
  if (trees.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <span>On</span>
      {trees.map((t) => (
        <span key={t.id} className="flex min-w-0 items-center gap-1.5">
          <TreeMarkDot mark={t.mark} />
          <TreeTarget
            treeId={t.id}
            currentTreeId={currentTreeId}
            href={treeFocusHref(personId)}
            variant="link"
            size="xs"
            className="relative tap-target h-auto px-0 whitespace-normal text-foreground underline underline-offset-2"
          >
            {t.name}
          </TreeTarget>
        </span>
      ))}
    </div>
  );
}
