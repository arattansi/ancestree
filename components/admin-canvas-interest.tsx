"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  deleteCanvasInterest,
  setCanvasInterestStatus,
} from "@/app/actions/canvas-interest";
import type { CanvasInterestRow } from "@/lib/growth-rights.server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * The interest register (Step 14.3): members the bloodline gate refused who
 * said they'd want a tree of their own. This grants nothing — it is a list of
 * people to reach out to if we take this to market, and evidence of whether
 * there is one.
 */
export function AdminCanvasInterest({ rows }: { rows: CanvasInterestRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nobody has asked for a tree of their own yet.
      </p>
    );
  }

  async function onStatus(id: string, status: "contacted" | "dismissed" | "new") {
    setBusyId(id);
    const res = await setCanvasInterestStatus(id, status);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    router.refresh();
  }

  async function onDelete(id: string) {
    setBusyId(id);
    const res = await deleteCanvasInterest(id);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Removed from the register.");
    router.refresh();
  }

  async function copyEmails() {
    const emails = rows
      .filter((r) => r.status !== "dismissed" && r.email)
      .map((r) => r.email)
      .join(", ");
    if (!emails) {
      toast.error("No email addresses to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(emails);
      toast.success("Email addresses copied");
    } catch {
      toast.error("Couldn't copy — select and copy them by hand.");
    }
  }

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={copyEmails}>
        Copy email addresses
      </Button>

      <ul className="space-y-4">
        {rows.map((r) => (
          <li key={r.id} className="space-y-2 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">
                {r.personName || r.displayName || "A member"}
              </p>
              {r.status === "contacted" ? (
                <Badge variant="secondary">Contacted</Badge>
              ) : null}
              {r.status === "dismissed" ? (
                <Badge variant="outline">Dismissed</Badge>
              ) : null}
            </div>

            {r.email ? (
              <p className="text-sm text-muted-foreground">{r.email}</p>
            ) : null}

            {r.note ? (
              <p className="text-sm italic text-muted-foreground">
                &ldquo;{r.note}&rdquo;
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {r.status !== "contacted" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onStatus(r.id, "contacted")}
                  disabled={busyId === r.id}
                >
                  Mark contacted
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onStatus(r.id, "new")}
                  disabled={busyId === r.id}
                >
                  Mark not contacted
                </Button>
              )}
              {r.status !== "dismissed" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onStatus(r.id, "dismissed")}
                  disabled={busyId === r.id}
                >
                  Dismiss
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(r.id)}
                disabled={busyId === r.id}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
