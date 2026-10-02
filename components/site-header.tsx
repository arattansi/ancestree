import { CircleUserRound, Network } from "lucide-react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";

import { signOut } from "@/app/actions/auth";
import {
  AdminNavLink,
  AdminQueueButton,
  ConnectionsNavLink,
  HeaderCountsProvider,
} from "@/components/header-counts";
import { LogoMark } from "@/components/logo-mark";
import { SiteHeaderHeight } from "@/components/site-header-height";
import { SiteNavMenu } from "@/components/site-nav-menu";
import { SiteNavLink, TreeNavLink } from "@/components/site-nav-link";
import { SiteNotifications } from "@/components/site-notifications";
import { SubmitButton } from "@/components/submit-button";
import { TreeSwitcher } from "@/components/tree-switcher";
import { Button } from "@/components/ui/button";
import { getProfile, getSessionUser } from "@/lib/auth";
import { headerCounts } from "@/lib/header-counts.server";
import { currentAccess, isTreeChosen, listMyTrees } from "@/lib/tree-context";
import { homeHref } from "@/lib/tree-links";
import { getTreeRequestStatus } from "@/lib/tree-requests.server";

/**
 * The header's frame: the mark on the left, then whatever sits in the
 * centre and on the right. `site-header-bar` lets a node's details sheet
 * move the header aside while it's open (globals.css). The mark goes to
 * the home page, for everyone (Step 107; a member's landing until then).
 *
 * One row (Step 85.2): the buttons never wrap, and the centre gives way to
 * them, a long tree name ending in "…". On a narrow bar (`header-compact`,
 * globals.css) the centre is what's left between the mark and the buttons;
 * the buttons wrap there only if even their compact row can't fit.
 *
 * The handwritten menu (Step 110) sits in the bar's top-left corner where
 * the page is wide enough to leave it room, and just before the mark
 * where it isn't.
 */
function HeaderFrame({
  center,
  nav,
}: {
  center?: ReactNode;
  nav?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 border-b bar-chrome">
      <div className="site-header-bar mx-auto grid min-h-14 w-full max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-x-4 px-4 py-2 header-compact:grid-cols-[auto_minmax(0,1fr)_auto] header-compact:gap-x-3">
        <div className="flex min-w-0 items-center gap-3">
          <SiteNavMenu className="min-[1240px]:absolute min-[1240px]:top-1/2 min-[1240px]:left-6 min-[1240px]:-translate-y-1/2" />
          <Link
            href="/"
            className="relative flex w-fit items-center gap-2 rounded-sm text-sm font-semibold tracking-tight text-foreground outline-none tap-target focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <LogoMark className="size-5" />
            <span className="header-compact:sr-only">ancestree.space</span>
          </Link>
        </div>
        <div className="flex min-w-0 items-center justify-center">{center}</div>
        <nav
          aria-label="Primary"
          className="flex items-center justify-end gap-2 header-compact:flex-wrap"
        >
          {nav}
        </nav>
      </div>
      <SiteHeaderHeight />
    </header>
  );
}

/**
 * The header before its buttons are known: the same bar with only the mark,
 * so the page below never moves when they arrive (Step 61). The root layout
 * shows it while `SiteHeader` streams in, and `SiteHeader` falls back to it
 * if what it reads can't be had.
 */
export function SiteHeaderShell() {
  return <HeaderFrame />;
}

/**
 * The site-wide header. Left, the mark, which takes everyone to the home
 * page (Step 107; members to My Family Tree from Step 92.5); centre, the tree switcher for every member (Step 92.2:
 * My Family Tree and their trees); right, a beta reviewer's **admin**
 * (Step 103), the tree's pages, the account — beside it, a count of
 * anything waiting in the admin consoles they run, which opens the card
 * it's waiting on (Step 30.1) — and notifications across every tree. The current tree is the one the
 * browser remembers, so it's known here without reading the address.
 * While a node's details sheet is open on the canvas, the header moves
 * aside for it so these buttons stay in reach (globals.css).
 *
 * Someone signed in who isn't a member yet gets a way to sign out, not
 * "sign in", which would only take them back to /join (Step 30.8).
 *
 * It streams in on its own (a Suspense boundary in the root layout, Step
 * 61), so no page waits for its counts, and a failure to read them leaves
 * the bare bar rather than an error page: the root layout's errors skip
 * every `error.tsx`.
 */
export async function SiteHeader() {
  try {
    return await LoadedHeader();
  } catch (error) {
    unstable_rethrow(error);
    console.error("[site-header] couldn't load the header", error);
    return <SiteHeaderShell />;
  }
}

async function LoadedHeader() {
  // All four need only the session, so they're read together (Step 77.1).
  const [profile, trees, access, chosen] = await Promise.all([
    getProfile(),
    listMyTrees(),
    currentAccess(),
    isTreeChosen(),
  ]);
  const signedInNotMember = profile ? false : Boolean(await getSessionUser());

  const currentMembership =
    access?.kind === "member" ? access.membership : null;
  const visiting =
    access?.kind === "visitor" ? { name: access.visit.tree.name } : null;
  // Every member gets the switcher (Step 92.2): My Family Tree is in it,
  // and starting a tree of their own until they've founded one.
  const showSwitcher = trees.length > 0;
  // Where a member lands every visit (Step 92.5): **tree** until a tree is
  // switched to.
  const home =
    profile && showSwitcher ? homeHref(profile.self_person_id) : undefined;
  // Counts only (Step 77.2): the bell reads its list when it's opened. Where
  // an ask to start a tree stands is read beside them, and only when no
  // tree of theirs says they founded one already.
  const [counts, startTree] = profile
    ? await Promise.all([
        headerCounts({ profile, trees, access }),
        !showSwitcher || trees.some((t) => t.founded)
          ? ("founded" as const)
          : getTreeRequestStatus(),
      ])
    : [null, "founded" as const];

  return (
    <HeaderFrame
      center={
        profile && showSwitcher ? (
          <TreeSwitcher
            trees={trees.map((t) => ({
              id: t.id,
              name: t.name,
              role: t.role,
            }))}
            currentId={currentMembership?.tree.id ?? null}
            chosen={chosen}
            visiting={visiting}
            myFamily={!!profile.self_person_id}
            startTree={startTree}
          />
        ) : null
      }
      nav={
        profile && counts ? (
          // The counts are kept fresh between saves by the page itself
          // (Step 77.2).
          <HeaderCountsProvider initial={counts}>
            {/* A beta reviewer's, before **tree** (Step 103). */}
            <AdminNavLink />
            {access ? (
              // The tree switched to this visit, else their landing (Step
              // 92.5).
              <TreeNavLink
                chosen={chosen}
                home={home ?? homeHref(profile.self_person_id)}
                icon={<Network className="size-4" aria-hidden />}
              >
                tree
              </TreeNavLink>
            ) : null}
            <ConnectionsNavLink />
            {/* Apart on a narrow bar, so each keeps a whole 44px target. */}
            <span className="flex items-center gap-1 header-compact:gap-2">
              <SiteNavLink
                href="/account"
                icon={<CircleUserRound className="size-4" aria-hidden />}
              >
                account
              </SiteNavLink>
              <AdminQueueButton />
            </span>
            <SiteNotifications />
          </HeaderCountsProvider>
        ) : signedInNotMember ? (
          <form action={signOut}>
            <SubmitButton
              size="sm"
              variant="outline"
              className="relative tap-target"
            >
              sign out
            </SubmitButton>
          </form>
        ) : (
          <Button
            nativeButton={false}
            render={<Link href="/join" />}
            size="sm"
            variant="outline"
            className="relative tap-target"
          >
            sign in
          </Button>
        )
      }
    />
  );
}
