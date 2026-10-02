"use client";

import { ChevronDown } from "lucide-react";
import * as React from "react";

import { ADMIN_NAVIGATE_EVENT } from "@/components/admin/nav-event";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A settings card that folds to its title (Step 108, Notifications): closed
 * at first, the chevron beside the title opens it. It opens itself when the
 * side nav points at it, or when the address's `#hash` names it or anything
 * in `opensFor` (the newsletter email's `#newsletter`), then brings that
 * into view, which a hash alone can't once the content wasn't on the page.
 * `action` sits at the header's right while it's open, as a `CardAction`
 * would, straight after the toggle.
 */
export function CollapsibleCard({
  id,
  title,
  opensFor = [],
  action,
  className,
  contentClassName,
  children,
}: {
  id: string;
  title: string;
  opensFor?: string[];
  action?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const scrollTo = React.useRef<string | null>(null);
  const contentId = `${id}-content`;
  const ids = [id, ...opensFor].join(",");

  React.useEffect(() => {
    const owned = new Set(ids.split(","));
    function reveal(target: string | null) {
      scrollTo.current = target;
      setOpen(true);
    }

    const hash = window.location.hash.slice(1);
    if (owned.has(hash)) reveal(hash);

    function onNavigate(event: Event) {
      if (owned.has((event as CustomEvent<string>).detail)) reveal(null);
    }
    window.addEventListener(ADMIN_NAVIGATE_EVENT, onNavigate);
    return () => window.removeEventListener(ADMIN_NAVIGATE_EVENT, onNavigate);
  }, [ids]);

  // Opened by a hash: the target is on the page only now.
  React.useEffect(() => {
    if (!open || !scrollTo.current) return;
    document.getElementById(scrollTo.current)?.scrollIntoView({ block: "start" });
    scrollTo.current = null;
  }, [open]);

  return (
    <Card id={id} className={cn("scroll-mt-24", className)}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={open ? contentId : undefined}
            className="relative flex items-center gap-1.5 rounded-sm text-left outline-none tap-target focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="font-heading text-base leading-snug font-medium">
              {title}
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
          {open ? action : null}
        </div>
      </CardHeader>
      {open ? (
        <CardContent id={contentId} className={contentClassName}>
          {children}
        </CardContent>
      ) : null}
    </Card>
  );
}
