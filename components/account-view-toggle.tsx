import Link from "next/link";

import { LinkPendingLabel } from "@/components/link-pending";
import { TreeTarget } from "@/components/tree-target";
import { Button, buttonVariants } from "@/components/ui/button";
import { adminHref } from "@/lib/tree-links";

export type AccountView = "profile" | "admin" | "dashboard" | "settings";
export type AdminTreeOption = { id: string; name: string };

/**
 * The account page's views: your profile (your own entry), the admin
 * console of the tree you're looking at (Roots only), the engagement
 * dashboard (beta reviewers only, Step 56), and settings. A Root of several
 * trees picks which console beneath the toggle — which also makes it the
 * tree the rest of the site shows. Labels are lower-case, like every
 * navigation button (docs/design-system.md).
 */
export function AccountViewToggle({
  view,
  consoleTreeId,
  adminTrees,
  dashboard,
}: {
  view: AccountView;
  /** The tree whose console the admin view shows; `null` when they run none. */
  consoleTreeId: string | null;
  /** Every tree they run, for the picker when there's more than one. */
  adminTrees: AdminTreeOption[];
  /** They're a beta reviewer, who has the dashboard. */
  dashboard: boolean;
}) {
  return (
    <div className="flex flex-col items-end gap-2">
      <div
        role="group"
        aria-label="Account view"
        className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5"
      >
        <ToggleLink href="/account" active={view === "profile"}>
          profile
        </ToggleLink>
        {consoleTreeId ? (
          // Never fetched ahead: the console archives lapsed invites as it's
          // drawn (Step 77.3).
          <ToggleLink href={adminHref()} active={view === "admin"} prefetch={false}>
            root
          </ToggleLink>
        ) : null}
        {dashboard ? (
          <ToggleLink
            href="/account?view=dashboard"
            active={view === "dashboard"}
          >
            dashboard
          </ToggleLink>
        ) : null}
        <ToggleLink href="/account?view=settings" active={view === "settings"}>
          settings
        </ToggleLink>
      </div>
      {view === "admin" && adminTrees.length > 1 ? (
        <nav
          aria-label="Root console for"
          className="flex flex-wrap items-center justify-end gap-1 text-xs text-muted-foreground"
        >
          <span>Console for</span>
          {adminTrees.map((t) =>
            t.id === consoleTreeId ? (
              // The one shown: nothing to open.
              <span
                key={t.id}
                aria-current="page"
                className={buttonVariants({ size: "xs", variant: "secondary" })}
              >
                {t.name}
              </span>
            ) : (
              // Another tree's console makes it the one the site shows, so
              // it switches first (Step 77.3).
              <TreeTarget
                key={t.id}
                treeId={t.id}
                currentTreeId={consoleTreeId}
                href={adminHref()}
                size="xs"
                variant="ghost"
              >
                {t.name}
              </TreeTarget>
            ),
          )}
        </nav>
      ) : null}
    </div>
  );
}

function ToggleLink({
  href,
  active,
  prefetch,
  children,
}: {
  href: string;
  active: boolean;
  prefetch?: false;
  children: React.ReactNode;
}) {
  return (
    <Button
      nativeButton={false}
      render={<Link href={href} prefetch={prefetch} />}
      size="sm"
      variant={active ? "default" : "ghost"}
      aria-current={active ? "page" : undefined}
      className="h-7"
    >
      {/* Pulses until the view is on its way in (Step 77.3). */}
      <LinkPendingLabel>{children}</LinkPendingLabel>
    </Button>
  );
}
