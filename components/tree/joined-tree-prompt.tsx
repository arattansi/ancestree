"use client";

import * as React from "react";

import { TreeTarget } from "@/components/tree-target";
import { treeHref } from "@/lib/tree-links";

/**
 * On My Family Tree just after joining a tree (Step 131): the welcome,
 * onboarding and an accepted invite land on the member's own view, and this
 * offers the tree they joined from there. Closing it takes `joined` off the
 * address, so a reload doesn't ask again.
 */
export function JoinedTreePrompt({
  tree,
  currentTreeId,
}: {
  tree: { id: string; name: string };
  /** The tree the browser is looking at, if any. */
  currentTreeId: string | null;
}) {
  const [closed, setClosed] = React.useState(false);
  if (closed) return null;

  function dismiss() {
    const url = new URL(window.location.href);
    url.searchParams.delete("joined");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    setClosed(true);
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
      {/* The button goes under the words when they'd squeeze it: beside a
          long tree name on a phone, they wrapped a word a line (Step 169). */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-[1_1_10rem] text-foreground">
          You’re on {tree.name} now.
        </p>
        <TreeTarget
          treeId={tree.id}
          currentTreeId={currentTreeId}
          href={treeHref()}
          size="sm"
          className="max-w-full"
        >
          <span className="truncate">view {tree.name}</span>
        </TreeTarget>
      </div>
      <button
        type="button"
        className="relative tap-target text-muted-foreground hover:text-foreground"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
