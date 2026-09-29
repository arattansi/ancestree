"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A section of a person's details that folds away (Step 88.1): its heading
 * is the button, with how many things are in it, so a closed section still
 * says what it holds. Folded, its content stays mounted and only hidden, so
 * nothing half typed in it is lost.
 */
export function SheetFold({
  title,
  count = 0,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  /** Shown beside the title when there's anything to count. */
  count?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const contentId = React.useId();
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5">
      <h2>
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-controls={contentId}
          className="relative tap-target flex w-full items-center gap-2 text-left text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {title}
          {/* Read as "Family 4", not "Family4"; the gap spaces it on screen. */}{" "}
          {count > 0 ? (
            <span className="text-xs font-normal text-muted-foreground">
              {count}
            </span>
          ) : null}
          <ChevronDown
            aria-hidden
            className={cn(
              "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </h2>
      <div id={contentId} hidden={!open} className="flex flex-col gap-3">
        {children}
      </div>
    </section>
  );
}
