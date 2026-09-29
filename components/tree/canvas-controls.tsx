"use client";

import * as React from "react";

/**
 * The canvas controls sit as bare symbols so they stay out of the way of the
 * tree, and widen to spell themselves out when you point at one.
 */
export function ExpandingLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-200 ease-out group-hover/expand:grid-cols-[1fr] group-focus-visible/expand:grid-cols-[1fr]">
      <span className="overflow-hidden whitespace-nowrap">
        <span className="pl-1.5">{children}</span>
      </span>
    </span>
  );
}

/** Three upright bars — the auto-arrange symbol. */
export function ColumnsIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M3.5 3v10M8 3v10M12.5 3v10" />
    </svg>
  );
}
