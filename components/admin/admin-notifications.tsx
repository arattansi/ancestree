"use client";

import { Bell } from "lucide-react";

import { ADMIN_NAVIGATE_EVENT } from "@/components/admin/nav-event";
import type { AdminActionItem } from "@/lib/admin-notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function navigateToSection(target: string) {
  window.dispatchEvent(
    new CustomEvent(ADMIN_NAVIGATE_EVENT, { detail: target }),
  );
  requestAnimationFrame(() =>
    document
      .getElementById(target)
      ?.scrollIntoView({ behavior: "smooth", block: "start" }),
  );
}

/**
 * The admin queue — pending access requests, disputed claims, and new own-tree
 * registrations. Mirrors the section nav: a thin floating rail on the right at
 * xl, and an inline card near the top of the console on narrower screens where
 * there's no room to float it.
 */
export function AdminNotifications({ items }: { items: AdminActionItem[] }) {
  const total = items.reduce((sum, i) => sum + i.count, 0);

  return (
    <>
      {items.length > 0 ? (
        <nav
          aria-label="Needs attention"
          className="fixed top-1/2 right-[max(1.5rem,calc(50%-34rem))] z-10 hidden w-44 -translate-y-1/2 xl:block"
        >
          <p className="pr-3 text-right text-[0.65rem] font-medium tracking-wide text-muted-foreground/70 uppercase">
            Needs attention
          </p>
          <ul className="mt-1 flex flex-col border-r border-border">
            {items.map((item) => (
              <li key={item.target}>
                <button
                  type="button"
                  onClick={() => navigateToSection(item.target)}
                  className="-mr-px block w-full border-r-2 border-transparent py-1 pr-3 text-right text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground outline-none focus-visible:text-foreground"
                >
                  <span className="font-medium tabular-nums text-foreground">
                    {item.count}
                  </span>{" "}
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <Card
        id="notifications"
        className={cn("scroll-mt-20", total > 0 && "xl:hidden")}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell aria-hidden className="size-4 text-muted-foreground" />
            Needs attention
          </CardTitle>
        </CardHeader>
        <CardContent>
          {total === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing waiting on you — the queue is clear.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((item) => (
                <li key={item.target}>
                  <button
                    type="button"
                    onClick={() => navigateToSection(item.target)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>
                      <span className="font-medium tabular-nums">
                        {item.count}
                      </span>{" "}
                      {item.label}
                    </span>
                    <span aria-hidden className="text-muted-foreground">
                      &rarr;
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
