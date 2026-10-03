"use client";

import { Bot } from "lucide-react";
import { usePathname } from "next/navigation";

const WATERMARK = (
  <>
    built with ai <Bot className="inline size-3.5 -mt-0.5" aria-hidden />{" "}
    because love wasn&apos;t enough.
  </>
);

/** A page's own footnote, in the footer's bottom-right corner: the
 *  asterisk at the end of /about-us's story (Step 111 follow-up). */
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

  const footnote = FOOTNOTES[pathname];

  // The watermark centred, a footnote in the page's bottom-right corner;
  // on a phone, under the watermark, still at the right.
  return (
    <footer className="w-full px-4 py-6 text-xs text-muted-foreground sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-baseline sm:gap-4">
      <p className="text-center sm:col-start-2">{WATERMARK}</p>
      {footnote ? <p className="mt-2 text-right sm:mt-0">{footnote}</p> : null}
    </footer>
  );
}
