"use client";

import * as React from "react";

import { listPersonTrees, type PersonTreeLink } from "@/app/actions/trees";
import { TreeTarget } from "@/components/tree-target";
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
  // Keyed by person, so switching cards never shows the last person's trees.
  const [state, setState] = React.useState<{
    personId: string;
    trees: PersonTreeLink[];
  } | null>(null);
  const trees = state?.personId === personId ? state.trees : null;

  React.useEffect(() => {
    let active = true;
    listPersonTrees(personId).then((rows) => {
      if (active) {
        setState({
          personId,
          trees: rows.filter((t) => t.id !== currentTreeId),
        });
      }
    });
    return () => {
      active = false;
    };
  }, [personId, currentTreeId]);

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
