"use client";

import * as React from "react";

import {
  emailMeANewsletterTest,
  setNewsletterSchedule,
} from "@/app/actions/newsletter";
import { PendingButton } from "@/components/pending-button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAction } from "@/components/use-action";
import { WEEKDAY_NAMES, type NewsletterSchedule } from "@/lib/newsletter";
import { MONTH_NAMES } from "@/lib/partial-date";

const noop = () => () => {};

/** "Sun 4 Oct, 8:00 AM" in the viewer's own time zone; null on the server. */
function useLocalTime(iso: string | null): string | null {
  return React.useSyncExternalStore(
    noop,
    () => {
      if (!iso) return null;
      const d = new Date(iso);
      const time = d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
      return `${WEEKDAY_NAMES[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}, ${time}`;
    },
    () => null,
  );
}

/**
 * The beta reviewers' controls for the weekly newsletter (Step 95): the
 * day it goes out, pausing it for everyone, and a test of their own issue
 * to their own address.
 */
export function NewsletterControls({
  schedule,
  nextAt,
}: {
  schedule: NewsletterSchedule;
  /** The next send, ISO; null while paused. */
  nextAt: string | null;
}) {
  const action = useAction();
  const [shown, setShown] = React.useOptimistic(schedule);
  const local = useLocalTime(nextAt);

  const save = (next: NewsletterSchedule, key: string) =>
    action.run(key, async () => {
      setShown(next);
      return setNewsletterSchedule(next.weekday, next.paused);
    });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {shown.paused
          ? "Paused. Nobody gets it."
          : `${WEEKDAY_NAMES[shown.weekday]}s at 15:00 UTC.${local ? ` Next: ${local} your time.` : ""}`}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="newsletter-day">Day</Label>
          <Select
            value={String(shown.weekday)}
            onValueChange={(v) =>
              save({ ...shown, weekday: Number(v ?? shown.weekday) }, "day")
            }
            disabled={action.pending}
          >
            <SelectTrigger id="newsletter-day" className="w-40">
              <SelectValue>
                {(value: string) => WEEKDAY_NAMES[Number(value)] ?? ""}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {WEEKDAY_NAMES.map((name, i) => (
                <SelectItem key={name} value={String(i)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <PendingButton
          variant="outline"
          onClick={() => save({ ...shown, paused: !shown.paused }, "pause")}
          pending={action.pendingKey === "pause"}
          disabled={action.pending}
          pendingLabel="Saving…"
        >
          {shown.paused ? "Resume" : "Pause"}
        </PendingButton>
        <PendingButton
          variant="outline"
          onClick={() =>
            action.run("test", emailMeANewsletterTest, {
              success: (r) =>
                r.sent ? "Sent to your address." : "Nothing to tell you this week.",
            })
          }
          pending={action.pendingKey === "test"}
          disabled={action.pending}
          pendingLabel="Sending…"
        >
          Email me a test
        </PendingButton>
      </div>
    </div>
  );
}
