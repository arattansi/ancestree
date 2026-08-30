import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/auth";

export async function SiteHeader() {
  const profile = await getProfile();

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          Ancestree
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-2">
          {profile ? (
            <>
              <Button nativeButton={false} render={<Link href="/tree" />} size="sm">
                Tree
              </Button>
              {profile.role === "admin" ? (
                <Button
                  nativeButton={false}
                  render={<Link href="/admin" />}
                  size="sm"
                  variant="ghost"
                >
                  Admin
                </Button>
              ) : null}
              <Button
                nativeButton={false}
                render={<Link href="/account" />}
                size="sm"
                variant="outline"
              >
                Account
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
