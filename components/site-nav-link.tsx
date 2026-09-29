"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isNavActive } from "@/lib/nav-active";

/**
 * A header nav button that turns solid black once you're on the page it points
 * at, and stays white with a grey outline everywhere else. It's lit on the
 * pages under it too, unless `exact`. On a narrow bar its symbol stands in
 * for its words, which still name it (Step 85.2, `header-compact` in
 * globals.css).
 */
export function SiteNavLink({
  href,
  exact = false,
  icon,
  count,
  children,
}: {
  href: string;
  exact?: boolean;
  /** Its symbol, `aria-hidden`, shown for the words on a narrow bar. */
  icon: React.ReactNode;
  /** A `NavCount` after the words. */
  count?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = isNavActive(pathname, href, exact);

  return (
    <Button
      nativeButton={false}
      render={<Link href={href} />}
      size="sm"
      variant={active ? "default" : "outline"}
      aria-current={active ? "page" : undefined}
      className="relative tap-target"
    >
      <span className="hidden header-compact:contents">{icon}</span>
      <span className="header-compact:sr-only">{children}</span>
      {count}
    </Button>
  );
}

/**
 * A count on a header button: beside its words, or on its corner where the
 * bar is narrow (Step 85.2). The button must be positioned.
 */
export function NavCount({
  variant,
  children,
}: {
  variant: "secondary" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <Badge
      variant={variant}
      className="ml-1.5 header-compact:absolute header-compact:-top-2 header-compact:-right-2 header-compact:ml-0 header-compact:h-4 header-compact:min-w-4 header-compact:px-1 header-compact:text-[0.625rem]"
    >
      {children}
    </Badge>
  );
}
