"use client";

import * as React from "react";

import { ADMIN_NAVIGATE_EVENT } from "@/components/admin/collapsible-section";
import { cn } from "@/lib/utils";

export type AdminNavItem = { id: string; label: string };

/**
 * Minimalist floating section nav for the admin page, Notion-style: a thin
 * ruled column of labels that tracks the section in view and expands a
 * collapsed section when clicked. Desktop only — there's no room beside the
 * content until the viewport is wide.
 */
export function AdminSideNav({ items }: { items: AdminNavItem[] }) {
  const [active, setActive] = React.useState<string | null>(
    items[0]?.id ?? null,
  );

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-10% 0px -75% 0px" },
    );
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  function go(event: React.MouseEvent, id: string) {
    event.preventDefault();
    setActive(id);
    window.dispatchEvent(new CustomEvent(ADMIN_NAVIGATE_EVENT, { detail: id }));
    requestAnimationFrame(() =>
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  return (
    <nav
      aria-label="Admin sections"
      className="fixed top-1/2 left-[max(1.5rem,calc(50%-34rem))] z-10 hidden -translate-y-1/2 xl:block"
    >
      <ul className="flex flex-col border-l border-border">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => go(e, item.id)}
              aria-current={active === item.id ? "true" : undefined}
              className={cn(
                "-ml-px block border-l-2 py-1 pl-3 text-xs transition-colors",
                active === item.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
