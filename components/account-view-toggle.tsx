import Link from "next/link";

import { switchTreeForm } from "@/app/actions/current-tree";
import { Button } from "@/components/ui/button";
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
          <ToggleLink href={adminHref()} active={view === "admin"}>
            admin
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
          aria-label="Admin console for"
          className="flex flex-wrap items-center justify-end gap-1 text-xs text-muted-foreground"
        >
          <span>Console for</span>
          {adminTrees.map((t) => (
            <form
              key={t.id}
              action={switchTreeForm.bind(null, t.id, adminHref())}
            >
              <Button
                type="submit"
                size="xs"
                variant={t.id === consoleTreeId ? "secondary" : "ghost"}
                aria-current={t.id === consoleTreeId ? "page" : undefined}
              >
                {t.name}
              </Button>
            </form>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function ToggleLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      nativeButton={false}
      render={<Link href={href} />}
      size="sm"
      variant={active ? "default" : "ghost"}
      aria-current={active ? "page" : undefined}
      className="h-7"
    >
      {children}
    </Button>
  );
}
