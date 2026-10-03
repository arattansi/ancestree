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
 *  asterisk at the end of /about-us's story (Step 111 follow-up), and
 *  the one after /features's "lucidchart" (Step 115). */
const FOOTNOTES: Record<string, React.ReactNode> = {
  "/about-us": (
    <>
      *RIP{" "}
      <a
        href="https://www.youtube.com/watch?v=rXWbyfhLMkg"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        Mitch Hedberg
      </a>
    </>
  ),
  "/features": (
    <>
      *end of list for collaborative software tools not monopolized by tech
      oligarchs.
    </>
  ),
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
  // on a phone, centred above the watermark.
  return (
    <footer className="flex w-full flex-col px-4 py-6 text-xs text-muted-foreground sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-baseline sm:gap-4">
      <p className="text-center sm:col-start-2 sm:row-start-1">{WATERMARK}</p>
      {footnote ? (
        <p className="order-first mb-2 text-center sm:order-none sm:col-start-3 sm:row-start-1 sm:mb-0 sm:text-right">
          {footnote}
        </p>
      ) : null}
    </footer>
  );
}
