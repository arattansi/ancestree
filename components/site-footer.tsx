"use client";

import { Bot } from "lucide-react";
import { usePathname } from "next/navigation";

const WATERMARK = (
  <>
    built with ai <Bot className="inline size-3.5 -mt-0.5" aria-hidden />{" "}
    because love wasn&apos;t enough.
  </>
);

/** A page's own footnote, said on the watermark's line: the asterisk at the
 *  end of /about-us's story (Step 111 follow-up). */
const FOOTNOTES: Record<string, string> = {
  "/about-us": "*RIP Mitch Hedberg",
};

export function SiteFooter() {
  const pathname = usePathname();

  // The tree canvas fills the viewport, My Family Tree's too (Step 92.2); a
  // footer there would only get in the way.
  if (
    pathname === "/tree" ||
    pathname === "/family" ||
    /^\/t\/[^/]+\/tree\/?$/.test(pathname)
  ) {
    return null;
  }

  return (
    <footer className="mx-auto w-full max-w-5xl px-4 py-6">
      <p className="text-center text-xs text-muted-foreground">
        {WATERMARK}
        {FOOTNOTES[pathname] ? (
          <span className="whitespace-nowrap"> · {FOOTNOTES[pathname]}</span>
        ) : null}
      </p>
    </footer>
  );
}
