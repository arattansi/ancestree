"use client";

import * as React from "react";

import {
  emailMeANewsletterTest,
  setNewsletterNote,
  setNewsletterSchedule,
} from "@/app/actions/newsletter";
import { FormError } from "@/components/form-error";
import { MarkdownHelp, MarkdownHelpButton } from "@/components/markdown-help";
import { PendingButton } from "@/components/pending-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAction } from "@/components/use-action";
import {
  NOTE_MAX,
  WEEKDAY_NAMES,
  type NewsletterSchedule,
} from "@/lib/newsletter";
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
    <div className="flex flex-col gap-6">
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
            pendingLabel="saving…"
          >
            {shown.paused ? "resume" : "pause"}
          </PendingButton>
          <PendingButton
            variant="outline"
            onClick={() =>
              action.run("test", emailMeANewsletterTest, {
                success: (r) =>
                  r.sent
                    ? "Sent to your address."
                    : "Nothing to tell you this week.",
              })
            }
            pending={action.pendingKey === "test"}
            disabled={action.pending}
            pendingLabel="sending…"
          >
            email me a test
          </PendingButton>
        </div>
      </div>
      <NextSendExtras note={schedule.note} allStories={schedule.all_stories} />
    </div>
  );
}

/**
 * What the next newsletter carries besides its news (Step 144): a note at
 * its top, in Markdown (Step 159), and whether it tells every story so
 * far. Both go with the next send only.
 */
function NextSendExtras({
  note: saved,
  allStories: savedAll,
}: {
  note: string | null;
  allStories: boolean;
}) {
  const action = useAction({ inline: true });
  const [note, setNote] = React.useState(saved ?? "");
  const [allStories, setAllStories] = React.useState(savedAll);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const changed = note.trim() !== (saved ?? "") || allStories !== savedAll;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        action.run("note", () => setNewsletterNote(note, allStories), {
          success: "Saved for the next newsletter.",
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newsletter-note">
          Note for the next newsletter (
          <MarkdownHelpButton open={helpOpen} onOpenChange={setHelpOpen} />)
        </Label>
        <Textarea
          id="newsletter-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={NOTE_MAX}
          rows={4}
          className="max-w-xl"
        />
        {helpOpen ? <MarkdownHelp onClose={() => setHelpOpen(false)} /> : null}
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="newsletter-all-stories"
          checked={allStories}
          onCheckedChange={(v) => setAllStories(v === true)}
        />
        <Label htmlFor="newsletter-all-stories" className="font-normal">
          Every story so far
        </Label>
      </div>
      <FormError>{action.error}</FormError>
      <PendingButton
        type="submit"
        variant="outline"
        className="self-start"
        pending={action.pendingKey === "note"}
        disabled={action.pending || !changed}
        pendingLabel="saving…"
      >
        save
      </PendingButton>
    </form>
  );
}
