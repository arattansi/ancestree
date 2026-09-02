import Link from "next/link";

import { SiteNavLink } from "@/components/site-nav-link";
import { SiteNotifications } from "@/components/site-notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProfile, getUser } from "@/lib/auth";
import { listNotifications } from "@/lib/claims";
import { countAdminActionItems } from "@/lib/admin-notifications";

export async function SiteHeader() {
  const profile = await getProfile();
  const isAdmin = profile?.role === "admin";
  const [user, adminItems] = profile
    ? await Promise.all([
        getUser(),
        isAdmin ? countAdminActionItems() : Promise.resolve(0),
      ])
    : [null, 0];
  const notifications = user ? await listNotifications(user.id) : [];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex min-h-14 w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
        <Link
          href="/"
          className="rounded-sm text-sm font-semibold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          ancestree.space
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-2">
          {profile ? (
            <>
              <SiteNavLink href="/tree">tree</SiteNavLink>
              {isAdmin ? (
                <SiteNavLink href="/admin">
                  admin
                  {adminItems > 0 ? (
                    <Badge variant="destructive" className="ml-1.5">
                      {adminItems}
                    </Badge>
                  ) : null}
                </SiteNavLink>
              ) : null}
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
