"use client";

import * as React from "react";

import { reportEntry } from "@/app/actions/entry-reports";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import { REPORT_MAX } from "@/lib/limits";

type Problem = "details" | "claim";

/**
 * Report a problem with an entry (Step 88.2): what's wrong, for whoever may
 * put it right. Whoever added a claimed entry may instead dispute who
 * claimed it, which goes to a Root; the choice shows only then. A form is its
 * labels.
 */
export function ReportDialog({
  open,
  onOpenChange,
  personId,
  treeId,
  canDispute,
  initial = "details",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  /** The tree it's reported from, whose inbox the reporter hears back in. */
  treeId: string;
  /** The viewer added this entry and someone has claimed it. */
  canDispute: boolean;
  /** What it opens on. */
  initial?: Problem;
}) {
  const send = useAction({ inline: true });
  const [problem, setProblem] = React.useState<Problem>(initial);
  const [body, setBody] = React.useState("");
  const dispute = canDispute && problem === "claim";

  // Opened afresh, for this entry.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setProblem(initial);
      setBody("");
      send.setError(null);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    send.run(
      "send",
      () => reportEntry({ personId, treeId, body: text, dispute }),
      {
        success: dispute ? "Sent to a Root." : "Report sent.",
        onSuccess: () => onOpenChange(false),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!send.pending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>Report a problem</DialogTitle>
        <form onSubmit={onSubmit} className="flex flex-col gap-4 pt-2">
          {canDispute ? (
            <RadioGroup
              aria-label="The problem"
              value={problem}
              onValueChange={(v) => {
                if (v === "details" || v === "claim") setProblem(v);
              }}
              disabled={send.pending}
            >
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <RadioGroupItem value="details" />
                Its details
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <RadioGroupItem value="claim" />
                Who claimed it
              </label>
            </RadioGroup>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="report-body">What’s wrong?</Label>
            <Textarea
              id="report-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={REPORT_MAX}
              disabled={send.pending}
              autoFocus
            />
          </div>
          <FormError>{send.error}</FormError>
          <div className="flex gap-2">
            <PendingButton
              type="submit"
              size="sm"
              pending={send.pending}
              disabled={!body.trim()}
              pendingLabel="Sending…"
            >
              Send
            </PendingButton>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={send.pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
