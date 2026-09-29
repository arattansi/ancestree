import type * as React from "react";

import { cn } from "@/lib/utils";

/** Widths a page's column comes in, as whole class names for Tailwind. */
const WIDTHS = {
  lg: "max-w-lg",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
} as const;

export type PageWidth = keyof typeof WIDTHS;

/**
 * A page's one column (Step 77.6, audit R10): centred at `width`, with the
 * room every page leaves around it. The skeletons draw the same shell, so
 * nothing moves when a page arrives; a form's floating buttons sit beside a
 * `2xl` one (`floating-form-actions.tsx`).
 */
export function PageColumn({
  width = "2xl",
  className,
  ...props
}: React.ComponentProps<"main"> & { width?: PageWidth }) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-10",
        WIDTHS[width],
        className,
      )}
      {...props}
    />
  );
}

/** A page with one thing in the middle of it: a card, or a message. */
export function CenteredPage({
  className,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24",
        className,
      )}
      {...props}
    />
  );
}
