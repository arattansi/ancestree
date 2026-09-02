"use client";

import { Bot } from "lucide-react";
import { usePathname } from "next/navigation";

const WATERMARK = (
  <>
    built with ai{" "}
    <Bot className="inline size-3.5 -mt-0.5" aria-hidden /> because love
    wasn&apos;t enough.
  </>
);

export function SiteFooter() {
  const pathname = usePathname();

  // The tree canvas fills the viewport; a footer there would only get in the way.
  if (pathname === "/tree") {
    return null;
  }

  return (
    <footer className="mx-auto w-full max-w-5xl px-4 py-6">
      <p className="text-center text-xs text-muted-foreground">{WATERMARK}</p>
    </footer>
  );
}
