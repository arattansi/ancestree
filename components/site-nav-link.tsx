"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";

/**
 * A header nav button that turns solid black once you're on the page it points
 * at, and stays white with a grey outline everywhere else.
 */
export function SiteNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Button
      nativeButton={false}
      render={<Link href={href} />}
      size="sm"
      variant={active ? "default" : "outline"}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Button>
  );
}
