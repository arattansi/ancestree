"use client";

import * as React from "react";
import Link from "next/link";

import { listPersonTrees, type PersonTreeLink } from "@/app/actions/trees";
import { treeFocusHref } from "@/lib/tree-links";

/**
 * "Also on" (Step 25): the other trees this person is shown on that the
 * viewer may open — as a member, or as a visitor where that tree's Root has
 * opened it to this one. The way from one family's canvas to the next runs
 * through the people they share.
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
        <Link
          key={t.id}
          href={treeFocusHref(t.slug, personId)}
          className="font-medium text-foreground underline underline-offset-2"
        >
          {t.name}
          {t.visitor ? " (view only)" : ""}
        </Link>
      ))}
    </div>
  );
}
