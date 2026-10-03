import type * as React from "react";

import { PageColumn } from "@/components/page-column";

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
    <PageColumn className="lg:grid lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start lg:gap-x-12 min-[1240px]:mr-auto min-[1240px]:ml-[max(18rem,calc(50%-32rem))] min-[1240px]:w-auto">
      <div className="flex flex-col gap-6">{children}</div>
      {aside ? <div className="pt-6">{aside}</div> : null}
    </PageColumn>
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
