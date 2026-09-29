import type { ReactNode } from "react";

import {
  CenteredPage,
  PageColumn,
  type PageWidth,
} from "@/components/page-column";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * What a page shows while it loads (Step 61): its own column with grey
 * shapes where its content will go, so a click answers at once and nothing
 * jumps when the page arrives. Each `loading.tsx` picks the one shaped like
 * its page; `label` is read out instead.
 */
function LoadingColumn({
  width,
  label,
  children,
}: {
  width?: PageWidth;
  label: string;
  children: ReactNode;
}) {
  return (
    <PageColumn width={width} aria-busy="true">
      {children}
      <span className="sr-only">{label}</span>
    </PageColumn>
  );
}

/** A form page: its title, labelled fields, then its button. */
export function FormPageSkeleton({
  label,
  width,
  fields = 5,
}: {
  label: string;
  width?: PageWidth;
  fields?: number;
}) {
  return (
    <LoadingColumn width={width} label={label}>
      <Skeleton className="h-8 w-56" />
      <div className="flex flex-col gap-5">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-8 w-32" />
    </LoadingColumn>
  );
}

/** A list page: its title, then rows. */
export function ListPageSkeleton({
  label,
  width,
  rows = 3,
}: {
  label: string;
  width?: PageWidth;
  rows?: number;
}) {
  return (
    <LoadingColumn width={width} label={label}>
      <Skeleton className="h-8 w-48" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </LoadingColumn>
  );
}

/**
 * The account page: its title and the view buttons beside it, then cards in
 * two columns from `md` up, as the page lays them out (docs/design-system.md).
 */
export function AccountPageSkeleton({ label }: { label: string }) {
  return (
    <LoadingColumn width="3xl" label={label}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-7 w-56 max-w-full" />
      </div>
      <AccountViewCards />
    </LoadingColumn>
  );
}

function AccountViewCards() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Skeleton className="h-48 w-full rounded-xl md:col-span-2" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

/**
 * One view of the account page while it loads, under the title and view
 * buttons that are already there (Step 77.3): a click on a view answers at
 * once rather than leaving the last one up.
 */
export function AccountViewSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true">
      <AccountViewCards />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** A page that is one card in the middle of the screen, like an invite. */
export function CardPageSkeleton({ label }: { label: string }) {
  return (
    <CenteredPage aria-busy="true">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-2 h-8 w-full" />
      </div>
      <span className="sr-only">{label}</span>
    </CenteredPage>
  );
}

/**
 * The canvas: the tree's field under the header, with a few cards. It fills
 * the screen below the header whatever the header's height (Step 61), like
 * the canvas itself.
 */
export function CanvasSkeleton({ label }: { label: string }) {
  return (
    <main aria-busy="true" className="flex flex-1 flex-col">
      <div className="relative h-[calc(100dvh-var(--site-header-height,3.5rem))] w-full overflow-hidden bg-muted/30">
        <div className="absolute right-4 top-4">
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="flex h-full flex-wrap content-center items-center justify-center gap-6 p-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-44 rounded-xl" />
          ))}
        </div>
        <span className="sr-only">{label}</span>
      </div>
    </main>
  );
}
