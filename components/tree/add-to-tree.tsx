"use client";

import * as React from "react";

import { switchTreeForm } from "@/app/actions/current-tree";
import { lazyComponent, useLoadedSoon } from "@/components/lazy-component";
import { AddMenu, type AddMedia } from "@/components/tree/add-menu";
import { useAction } from "@/components/use-action";
import type { FamilyViewTree } from "@/lib/my-family";
import { addRelativeHref } from "@/lib/tree-links";

// The question, fetched once the canvas has painted (Step 87.4), and
// mounted, closed, when it's here.
const AddToTreeDialog = lazyComponent(() =>
  import("@/components/tree/add-to-tree-dialog").then((m) => m.AddToTreeDialog),
);

/** Where "Add a relative" goes from My Family Tree (Step 92.3). */
export type FamilyAdd = {
  /** Whose relative, or nobody's. */
  relatedTo: { id: string; name: string } | null;
  /** The trees it may go on (`addTreesFromView`), in the key's order. */
  trees: FamilyViewTree[];
  /** The tree the browser remembers, which opens without a switch. */
  currentTreeId: string | null;
};

/**
 * My Family Tree's "Add a relative" (Step 92.3): the view adds nothing
 * itself, so the relative goes on one of the member's trees, in that
 * tree's own add flow. With one tree to choose it goes straight there,
 * switching to it first if the browser is looking at another; with more,
 * it asks which. It's the + (Step 145), with photos and a story beside it.
 */
export function FamilyAddButton({
  add,
  subject,
  media,
  labelFrom,
  answersRequests,
  className,
}: {
  add: FamilyAdd;
  /** Who photos and a story start with. */
  subject: { id: string; name: string } | null;
  media: AddMedia | null;
  labelFrom?: "always" | "sm" | "lg";
  /** The view's own +, which `openAddMenu` opens (Step 170). */
  answersRequests?: boolean;
  className?: string;
}) {
  const go = useAction();
  const [asking, setAsking] = React.useState(false);
  const [dialogReady] = useLoadedSoon(AddToTreeDialog.preload);
  const { relatedTo, trees, currentTreeId } = add;
  const href = addRelativeHref(relatedTo?.id);
  const only = trees.length === 1 ? trees[0] : null;

  const menu = {
    relatedTo,
    subject,
    media,
    labelFrom,
    answersRequests,
    className,
  };
  // No tree to add a relative on: photos and stories only.
  if (trees.length === 0) return <AddMenu {...menu} relative={null} />;
  // The tree the browser is on already: the add flow, as on its canvas.
  if (only && only.id === currentTreeId) {
    return <AddMenu {...menu} relative={{ href }} />;
  }
  return (
    <>
      <AddMenu
        {...menu}
        relative={{
          pending: go.pending,
          onClick: () => {
            if (only) go.run("add", () => switchTreeForm(only.id, href));
            else setAsking(true);
          },
        }}
      />
      {!only && (dialogReady || asking) ? (
        <AddToTreeDialog
          open={asking}
          onOpenChange={setAsking}
          trees={trees}
          currentTreeId={currentTreeId}
          href={href}
        />
      ) : null}
    </>
  );
}
