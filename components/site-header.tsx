import Link from "next/link";

import { switchTreeForm } from "@/app/actions/current-tree";
import { LogoMark } from "@/components/logo-mark";
import { SiteHeaderHeight } from "@/components/site-header-height";
import { SiteNavLink } from "@/components/site-nav-link";
import { SiteNotifications } from "@/components/site-notifications";
import { SubmitButton } from "@/components/submit-button";
import { TreeSwitcher } from "@/components/tree-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { countAdminQueue } from "@/lib/admin-notifications";
import { pickQueueTarget, queueCountLabel } from "@/lib/admin-queue";
import { getProfile, getUser } from "@/lib/auth";
import { listNotifications } from "@/lib/claims";
import { countOpenConnectionSuggestions } from "@/lib/connection-suggestions.server";
import { currentAccess, listMyTrees } from "@/lib/tree-context";
import { adminHref, reviewHref, treeHref } from "@/lib/tree-links";
import { countPendingTreeRequests } from "@/lib/tree-requests.server";

/**
 * The site-wide header. Left, the mark; centre, the tree switcher for
 * anyone with more than one tree to look at; right, the tree's pages, the
 * account — beside it, a count of anything waiting in the admin consoles
 * they run, which opens the card it's waiting on (Step 30.1) — and
 * notifications across every tree. The current tree is the one the
 * browser remembers, so it's known here without reading the address.
 * While a node's details sheet is open on the canvas, the header moves
 * aside for it so these buttons stay in reach (globals.css).
 */
export async function SiteHeader() {
  const profile = await getProfile();
  const [user, trees, access] = profile
    ? await Promise.all([getUser(), listMyTrees(), currentAccess()])
    : [null, [], null];

  const currentMembership =
    access?.kind === "member" ? access.membership : null;
  const visiting =
    access?.kind === "visitor" ? { name: access.visit.tree.name } : null;

  const runs = trees.filter((t) => t.type.runsTree);
  const [notifications, openConnections, queues, treeRequests] =
    await Promise.all([
      user ? listNotifications(user.id) : [],
      currentMembership
        ? countOpenConnectionSuggestions(currentMembership.tree.id)
        : 0,
      Promise.all(runs.map((t) => countAdminQueue(t.id))),
      // A beta reviewer answers from an admin console, so has a tree to run.
      runs.length > 0 ? countPendingTreeRequests() : 0,
    ]);
  const adminItems =
    queues.reduce((sum, q) => sum + q.inviteRequests + q.disputedClaims, 0) +
    treeRequests;
  // One tap from the count to what's waiting, on whichever tree it's on.
  const queue = pickQueueTarget({
    trees: queues,
    treeRequests,
    currentTreeId: currentMembership?.tree.id ?? null,
  });
  const showSwitcher =
    trees.length > 1 || (visiting !== null && trees.length > 0);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      {/* `site-header-bar` and `site-header-wordmark` let a node's details
          sheet move the header aside while it's open (globals.css). */}
      <div className="site-header-bar mx-auto grid min-h-14 w-full max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-x-4 px-4 py-2">
        <Link
          href="/"
          className="flex w-fit items-center gap-2 rounded-sm text-sm font-semibold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <LogoMark className="size-5" />
          <span className="site-header-wordmark">ancestree.space</span>
        </Link>
        <div className="flex min-w-0 items-center justify-center">
          {profile && showSwitcher ? (
            <TreeSwitcher
              trees={trees.map((t) => ({
                id: t.id,
                name: t.name,
                role: t.role,
              }))}
              currentId={currentMembership?.tree.id ?? null}
              visiting={visiting}
            />
          ) : null}
        </div>
        <nav
          aria-label="Primary"
          className="flex flex-wrap items-center justify-end gap-2"
        >
          {profile ? (
            <>
              {access ? (
                <SiteNavLink href={treeHref()}>tree</SiteNavLink>
              ) : null}
              {openConnections > 0 ? (
                <SiteNavLink href={reviewHref()}>
                  connections
                  <Badge variant="secondary" className="ml-1.5">
                    {openConnections}
                  </Badge>
                </SiteNavLink>
              ) : null}
              <span className="flex items-center gap-1">
                <SiteNavLink href="/account">account</SiteNavLink>
                {queue ? (
                  <form
                    action={switchTreeForm.bind(
                      null,
                      queue.treeId,
                      adminHref(queue.section),
                    )}
                  >
                    <SubmitButton
                      size="sm"
                      variant="destructive"
                      aria-label={queueCountLabel(adminItems)}
                      title={queueCountLabel(adminItems)}
                      className="tabular-nums"
                    >
                      {adminItems}
                    </SubmitButton>
                  </form>
                ) : null}
              </span>
              <SiteNotifications items={notifications} />
            </>
          ) : (
            <Button
              nativeButton={false}
              render={<Link href="/join" />}
              size="sm"
              variant="outline"
            >
              sign in
            </Button>
          )}
        </nav>
      </div>
      <SiteHeaderHeight />
    </header>
  );
}
