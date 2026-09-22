import Link from "next/link";

import { LogoMark } from "@/components/logo-mark";
import { SiteNavLink } from "@/components/site-nav-link";
import { SiteNotifications } from "@/components/site-notifications";
import { Button } from "@/components/ui/button";
import { getProfile, getUser } from "@/lib/auth";
import { listNotifications } from "@/lib/claims";
import { defaultTreeSlug } from "@/lib/tree-context";
import { treeHref, treesHref } from "@/lib/tree-links";

/**
 * The site-wide header (Step 25): the same on every page, so it knows nothing
 * about which tree is open. "tree" opens the member's default tree; the tree
 * bar beneath it, on tree pages, carries the tree's own navigation.
 */
export async function SiteHeader() {
  const profile = await getProfile();
  const [user, slug] = profile
    ? await Promise.all([getUser(), defaultTreeSlug(profile)])
    : [null, null];
  // Across every tree: each item names its tree.
  const notifications = user ? await listNotifications(user.id) : [];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex min-h-14 w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-sm text-sm font-semibold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <LogoMark className="size-5" />
          ancestree.space
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-2">
          {profile ? (
            <>
              {slug ? <SiteNavLink href={treeHref(slug)}>tree</SiteNavLink> : null}
              <SiteNavLink href={treesHref()}>trees</SiteNavLink>
              <SiteNavLink href="/account">account</SiteNavLink>
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
    </header>
  );
}
