import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/auth";
import { countUnreadNotifications } from "@/lib/claims";
import { countAdminActionItems } from "@/lib/admin-notifications";

export async function SiteHeader() {
  const profile = await getProfile();
  const isAdmin = profile?.role === "admin";
  const [unread, adminItems] = profile
    ? await Promise.all([
        countUnreadNotifications(),
        isAdmin ? countAdminActionItems() : Promise.resolve(0),
      ])
    : [0, 0];

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
              <Button nativeButton={false} render={<Link href="/tree" />} size="sm">
                Tree
              </Button>
              {isAdmin ? (
                <Button
                  nativeButton={false}
                  render={<Link href="/admin" />}
                  size="sm"
                  variant="ghost"
                >
                  Admin
                  {adminItems > 0 ? (
                    <Badge variant="destructive" className="ml-1.5">
                      {adminItems}
                    </Badge>
                  ) : null}
                </Button>
              ) : null}
              <Button
                nativeButton={false}
                render={<Link href="/account" />}
                size="sm"
                variant="outline"
              >
                Account
                {unread > 0 ? (
                  <Badge variant="destructive" className="ml-1.5">
                    {unread}
                  </Badge>
                ) : null}
              </Button>
            </>
          ) : (
            <Button
              nativeButton={false}
              render={<Link href="/join" />}
              size="sm"
              variant="outline"
            >
              Sign in
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
