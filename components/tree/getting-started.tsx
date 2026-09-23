"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, Circle } from "lucide-react";

import type { GettingStartedItem } from "@/lib/first-tree";
import { onboardingStepHref } from "@/lib/tree-links";
import { cn } from "@/lib/utils";

const keyFor = (treeId: string) => `ancestree:getting-started-dismissed:${treeId}`;

// Another tab dismissing the list hides it here too.
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * "Getting started" on the canvas, for the Root who founded the tree (Step
 * 29): what's left of their first run, each item a link back to its step.
 * It goes once everything's done, or when they close it — remembered in this
 * browser, for this tree, like the canvas tip. The server snapshot says
 * "dismissed", so it only appears after hydration, for those who haven't.
 */
export function GettingStarted({
  treeId,
  items,
}: {
  treeId: string;
  items: GettingStartedItem[];
}) {
  const storageKey = keyFor(treeId);
  const dismissed = React.useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(storageKey) === "1";
      } catch {
        // Storage blocked: show it, and let the close button hide it for
        // this visit.
        return false;
      }
    },
    () => true,
  );
  const [closed, setClosed] = React.useState(false);
  const [open, setOpen] = React.useState(true);
  const titleId = React.useId();
  if (dismissed || closed) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Nowhere to remember it; closing still hides it for this visit.
    }
    setClosed(true);
  }

  const done = items.filter((i) => i.done).length;

  return (
    <section
      aria-labelledby={titleId}
      className="w-60 rounded-lg border border-border bg-card/95 p-3 text-sm shadow-md"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
          <span id={titleId} className="truncate font-medium text-foreground">
            Getting Started
          </span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {done} of {items.length}
          </span>
        </button>
        <button
          type="button"
          className="text-muted-foreground/60 hover:text-foreground"
          onClick={dismiss}
          aria-label="Dismiss getting started"
        >
          ✕
        </button>
      </div>
      {open ? (
        <ol className="mt-2 flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-2">
              {item.done ? (
                <>
                  <Check aria-hidden className="size-4 shrink-0 text-account-canopy" />
                  <span className="text-muted-foreground">
                    {item.label}
                    <span className="sr-only">, done</span>
                  </span>
                </>
              ) : (
                <>
                  <Circle aria-hidden className="size-4 shrink-0 text-muted-foreground/50" />
                  <Link
                    href={onboardingStepHref(item.step)}
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    {item.label}
                  </Link>
                </>
              )}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
