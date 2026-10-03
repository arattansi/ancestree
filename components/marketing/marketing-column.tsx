import type * as React from "react";

import { PageColumn } from "@/components/page-column";
import { cn } from "@/lib/utils";

/** The column's grid: words on the left, the aside's 440px beside them. */
const GRID =
  "lg:grid lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start lg:gap-x-12 min-[1240px]:mr-auto min-[1240px]:ml-[max(18rem,calc(50%-32rem))] min-[1240px]:w-auto";

/**
 * The marketing pages' column, set by /about-us, the one with media on it
 * (Step 111 follow-up): the heading and words on the left, and the `aside`
 * beside them from `lg` (under them on a phone). A page with no aside keeps
 * its room empty, so every page's words start, and wrap, where about-us's
 * story does. From 1240px the column keeps clear of the menu held open on
 * the left.
 */
export function MarketingColumn({
  aside,
  children,
}: {
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <PageColumn className={GRID}>
      <MarketingRow aside={aside}>{children}</MarketingRow>
    </PageColumn>
  );
}

/**
 * The same column for a page in parts (/features, Step 115): each
 * `MarketingRow` its words on the left and its own aside beside them, a
 * part's aside starting level with its words.
 */
export function MarketingRows({ children }: { children: React.ReactNode }) {
  return (
    <PageColumn className={cn(GRID, "lg:gap-y-16")}>{children}</PageColumn>
  );
}

/**
 * One part of a `MarketingRows` page, or a `MarketingColumn`'s only one.
 * A `flush` aside starts level with the part's heading rather than under
 * it: a sample kept no taller than the words beside it (Step 115). A
 * `wide` part has no aside and its words run across both columns.
 */
export function MarketingRow({
  aside,
  flush = false,
  wide = false,
  children,
}: {
  aside?: React.ReactNode;
  flush?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className={cn(
          "flex flex-col gap-6 lg:col-start-1",
          wide && "lg:col-span-2",
        )}
      >
        {children}
      </div>
      {aside ? (
        <div className={cn("pt-6 lg:col-start-2", flush && "lg:pt-0")}>
          {aside}
        </div>
      ) : null}
    </>
  );
}

/**
 * A marketing page's words, Aalim's paragraphs one blank line apart: `gap-5`
 * is `text-sm`'s line height (Step 111 follow-up). Not the privacy page's,
 * which has its own sections.
 */
export function MarketingCopy({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
