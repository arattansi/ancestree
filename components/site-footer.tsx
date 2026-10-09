"use client";

import { usePathname } from "next/navigation";

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
  if (!footnote) return null;

  // A page's footnote in its bottom-right corner; on a phone, centred.
  return (
    <footer className="w-full px-4 py-6 text-xs text-muted-foreground">
      <p className="text-center sm:text-right">{footnote}</p>
    </footer>
  );
}
