import Link from "next/link";

import { Button } from "@/components/ui/button";

export function SiteHeader() {
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
          <Button nativeButton={false} render={<Link href="/tree" />} size="sm">
            Tree
          </Button>
          <Button
            nativeButton={false}
            render={<Link href="/join" />}
            size="sm"
            variant="outline"
          >
            Join
          </Button>
        </nav>
      </div>
    </header>
  );
}
