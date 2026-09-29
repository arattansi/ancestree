"use client";

import type { ReactNode } from "react";
import { useLinkStatus } from "next/link";

import { cn } from "@/lib/utils";

/**
 * A link's label that pulses while the page it leads to is on its way
 * (Step 77.3, audit N3): the click answers at once, even where the page
 * takes a moment and nothing else on screen moves. Nothing changes size.
 * Must sit inside the `<Link>`.
 */
export function LinkPendingLabel({
  children,
  className,
}: {
  children: ReactNode;
  /** For a label laid out as the link was (a row of icon and words). */
  className?: string;
}) {
  const { pending } = useLinkStatus();
  return (
    <span
      data-pending={pending ? "" : undefined}
      aria-busy={pending || undefined}
      className={cn(className, pending && "animate-pulse")}
    >
      {children}
    </span>
  );
}
