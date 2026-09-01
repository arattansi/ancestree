"use client";

import { Bell } from "lucide-react";
import * as React from "react";

import { ADMIN_NAVIGATE_EVENT } from "@/components/admin/nav-event";
import type { AdminActionItem } from "@/lib/admin-notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * "Needs attention" — the admin queue surfaced at the top of the console.
 * Each row jumps to and opens the section that clears it.
 */
export function AdminNotifications({ items }: { items: AdminActionItem[] }) {
  function go(target: string) {
    window.dispatchEvent(
      new CustomEvent(ADMIN_NAVIGATE_EVENT, { detail: target }),
    );
    requestAnimationFrame(() =>
      document
        .getElementById(target)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const total = items.reduce((sum, i) => sum + i.count, 0);

  return (
    <Card id="notifications" className="scroll-mt-20">
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
                  onClick={() => go(item.target)}
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
  );
}
