import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A long form's buttons, kept in reach wherever someone is in it (Step 59):
 * from `lg` up a column just right of the form, level with the page's title;
 * below that a bar along the bottom of the screen. Forms sit in the centred
 * `max-w-2xl` column (docs/design-system.md), which the column's `left`
 * counts from. Render it at the end of the form, where its buttons would
 * otherwise be, so a keyboard or a screen reader still meets them right
 * after the fields. globals.css makes room for the bar.
 */
export function FloatingFormActions({
  error,
  children,
}: {
  /** Why the last save didn't go through, shown by the buttons. */
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div
      data-floating-actions
      className={cn(
        "fixed z-30",
        "max-lg:inset-x-0 max-lg:bottom-0 max-lg:border-t max-lg:bar-chrome",
        "lg:top-[calc(var(--site-header-height,3.5rem)+2.5rem)] lg:left-[calc(50%+21.5rem)] lg:w-36",
      )}
    >
      {/* The bar grows upwards and the column downwards, so a message goes
          above the buttons in one and below them in the other: either way
          the buttons stay where they were. */}
      <div className="mx-auto flex max-w-2xl flex-col-reverse gap-2 px-4 py-3 lg:flex-col lg:p-0">
        <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
          {children}
        </div>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
