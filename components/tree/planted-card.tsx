"use client";

import * as React from "react";
import Link from "next/link";

import { LinkPendingLabel } from "@/components/link-pending";
import { Button } from "@/components/ui/button";
import { inviteFamilyHref, plantedCardText } from "@/lib/first-tree";

const keyFor = (treeId: string) => `ancestree:planted-card-dismissed:${treeId}`;

// Another tab closing it hides it here too.
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * On My Family Tree at the end of a founder's first run (Step 169): how big
 * the tree they've just planted is, and one button to the invite step's
 * list of the people they added. Closing it is for good, in this browser,
 * for this tree, like the checklist's; it also takes `planted` off the
 * address. The server snapshot says "closed", so it appears after
 * hydration, for those who haven't.
 */
export function PlantedCard({
  tree,
}: {
  tree: { id: string; name: string; people: number };
}) {
  const storageKey = keyFor(tree.id);
  const dismissed = React.useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(storageKey) === "1";
      } catch {
        // Storage blocked: show it, and let ✕ hide it for this visit.
        return false;
      }
    },
    () => true,
  );
  const [closed, setClosed] = React.useState(false);
  if (dismissed || closed) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Nowhere to remember it; closing still hides it for this visit.
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("planted");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    setClosed(true);
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
      {/* The button goes under the words when they'd squeeze it. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-[1_1_12rem] text-foreground">
          {plantedCardText(tree.name, tree.people)}
        </p>
        <Button
          size="sm"
          nativeButton={false}
          render={<Link href={inviteFamilyHref()} />}
        >
          <LinkPendingLabel>invite family</LinkPendingLabel>
        </Button>
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
