"use client";

import { ChevronDown } from "lucide-react";
import * as React from "react";

import { ADMIN_NAVIGATE_EVENT } from "@/components/admin/nav-event";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A top-level admin group: one collapsible Card that holds several
 * {@link AdminSubsection}s. Starts closed unless `defaultOpen`, and opens
 * itself when the side nav (or a `#section` hash on load) points at any of the
 * `sectionIds` it contains.
 */
export function AdminGroup({
  id,
  title,
  description,
  sectionIds,
  defaultOpen = false,
  badge = 0,
  children,
}: {
  /** Set when the group holds a single block — the Card becomes its own
   *  scroll/nav target and no inner {@link AdminSubsection} is needed. */
  id?: string;
  title: string;
  description?: React.ReactNode;
  sectionIds: string[];
  defaultOpen?: boolean;
  badge?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const ids = sectionIds.join(",");

  React.useEffect(() => {
    const owned = new Set(ids.split(","));
    function reveal() {
      setOpen(true);
    }

    const hash = window.location.hash.slice(1);
    if (hash && owned.has(hash)) reveal();

    function onNavigate(event: Event) {
      const id = (event as CustomEvent<string>).detail;
      if (owned.has(id)) reveal();
    }
    window.addEventListener(ADMIN_NAVIGATE_EVENT, onNavigate);
    return () => window.removeEventListener(ADMIN_NAVIGATE_EVENT, onNavigate);
  }, [ids]);

  return (
    <Card id={id} className="scroll-mt-20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 px-(--card-spacing) text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="font-heading text-lg leading-snug font-medium">
              {title}
            </span>
            {badge > 0 ? <Badge variant="destructive">{badge}</Badge> : null}
          </span>
          {description ? (
            <span className="text-sm text-muted-foreground">{description}</span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "mt-1 size-5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <CardContent className="flex flex-col border-t border-border pt-(--card-spacing) [&>section]:border-t [&>section]:border-border [&>section]:pt-6 [&>section:first-child]:border-t-0 [&>section:first-child]:pt-0 [&>section~section]:mt-6">
          {children}
        </CardContent>
      ) : null}
    </Card>
  );
}

/**
 * A titled block inside an {@link AdminGroup}. It carries the scroll anchor and
 * heading the side nav targets. Pass `collapsible` for list-heavy blocks (the
 * nickname table, member list, invite history…) so the group stays scannable —
 * a collapsed block still opens itself when the side nav or a `#hash` points at
 * it.
 */
export function AdminSubsection({
  id,
  title,
  description,
  contentClassName,
  collapsible = false,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  contentClassName?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen || !collapsible);

  React.useEffect(() => {
    if (!collapsible) return;
    function reveal() {
      setOpen(true);
    }
    if (window.location.hash.slice(1) === id) reveal();

    function onNavigate(event: Event) {
      if ((event as CustomEvent<string>).detail === id) reveal();
    }
    window.addEventListener(ADMIN_NAVIGATE_EVENT, onNavigate);
    return () => window.removeEventListener(ADMIN_NAVIGATE_EVENT, onNavigate);
  }, [collapsible, id]);

  const heading = (
    <div className="flex flex-col gap-1">
      <h3 className="font-heading text-base leading-snug font-medium">
        {title}
      </h3>
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );

  if (!collapsible) {
    return (
      <section id={id} className="scroll-mt-20">
        {heading}
        <div className={cn("mt-4", contentClassName)}>{children}</div>
      </section>
    );
  }

  return (
    <section id={id} className="scroll-mt-20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {heading}
        <ChevronDown
          aria-hidden
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className={cn("mt-4", contentClassName)}>{children}</div>
      ) : null}
    </section>
  );
}
