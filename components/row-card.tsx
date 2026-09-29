import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * One thing to act on in a list (Step 77.6, audit R8): a bordered card, as
 * the Root console's queues, the notifications and an entry's suggestions
 * each drew their own. Its lines stack (`stack`); or stack on a phone and,
 * from `sm`, sit on one row with the buttons at the end (`split`); or share
 * one row that wraps, a name beside its button (`row`).
 */
const LAYOUTS = {
  stack: "flex flex-col gap-2",
  split: "flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between",
  row: "flex flex-wrap items-center justify-between gap-3",
} as const;

export function RowCard({
  layout = "stack",
  className,
  ...props
}: React.ComponentProps<"li"> & { layout?: keyof typeof LAYOUTS }) {
  return (
    <li
      className={cn(LAYOUTS[layout], "rounded-md border p-3 text-sm", className)}
      {...props}
    />
  );
}

/**
 * A list of {@link RowCard}s, one per item, or the line that says there's
 * nothing in it. Cards that stack their lines sit a little apart; `dense`
 * one-line rows closer.
 */
export function RowList<T>({
  items,
  empty,
  dense = false,
  className,
  children,
}: {
  items: readonly T[];
  empty: React.ReactNode;
  dense?: boolean;
  className?: string;
  children: (item: T, index: number) => React.ReactNode;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className={cn("flex flex-col", dense ? "gap-2" : "gap-3", className)}>
      {items.map(children)}
    </ul>
  );
}
