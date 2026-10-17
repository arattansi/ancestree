"use client";

import * as React from "react";
import { ArrowUpIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A floating "back to top" button for long pages: hidden until the page has
 * scrolled a screen's worth, then bottom-right, out of the content's way.
 */
export function BackToTop() {
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    function onScroll() {
      setShown(window.scrollY > window.innerHeight * 0.75);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      aria-label="Back to top"
      title="Back to top"
      tabIndex={shown ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={cn(
        "fixed right-4 bottom-4 z-40 rounded-full shadow-md transition-opacity",
        shown ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <ArrowUpIcon className="size-4" aria-hidden />
    </Button>
  );
}
