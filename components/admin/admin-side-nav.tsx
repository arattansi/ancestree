"use client";

import * as React from "react";

import { ADMIN_NAVIGATE_EVENT } from "@/components/admin/nav-event";
import { cn } from "@/lib/utils";

export type AdminNavItem = { id: string; label: string };
/** A `label` of `null` renders the items flush, with no group heading. */
export type AdminNavGroup = { label: string | null; items: AdminNavItem[] };

/**
 * Minimalist floating section nav for the admin page, Notion-style: a thin
 * ruled column of labels grouped to match the console's groups. Clicking a
 * label opens its group and scrolls to it. Desktop only — there's no room
 * beside the content until the viewport is wide.
 */
export function AdminSideNav({ groups }: { groups: AdminNavGroup[] }) {
  const allItems = React.useMemo(
    () => groups.flatMap((g) => g.items),
    [groups],
  );
  const [active, setActive] = React.useState<string | null>(
    allItems[0]?.id ?? null,
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
    for (const item of allItems) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [allItems]);

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
      className="fixed top-1/2 left-[max(1.5rem,calc(50%-34rem))] z-10 hidden max-h-[80vh] -translate-y-1/2 overflow-y-auto xl:block"
    >
      <ul className="flex flex-col gap-3 border-l border-border">
        {groups.map((group) => (
          <li key={group.label ?? group.items[0]?.id}>
            {group.label ? (
              <p className="-ml-px py-1 pl-3 text-[0.65rem] font-medium tracking-wide text-muted-foreground/70 uppercase">
                {group.label}
              </p>
            ) : null}
            <ul className="flex flex-col">
              {group.items.map((item) => (
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
          </li>
        ))}
      </ul>
    </nav>
  );
}
