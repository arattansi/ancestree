"use client";

import * as React from "react";
import { toast } from "sonner";

import { requestTreeCanvas } from "@/app/actions/tree-canvas-requests";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Shown when the bloodline gate refuses an add (Step 14). The refusal is not a
 * dead end: what they were doing is starting their own family tree, and this
 * asks an admin for a canvas to do it on — bridged back to this tree through
 * their marriage.
 */
export function NewCanvasPrompt({
  open,
  onOpenChange,
  alreadyRequested = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** They have a request already waiting on an admin. */
  alreadyRequested?: boolean;
}) {
  const [note, setNote] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function onRequest() {
    setSending(true);
    const res = await requestTreeCanvas(note);
    setSending(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setSent(true);
    toast.success("Request sent — an admin will be in touch.");
  }

  const waiting = sent || alreadyRequested;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Looks like you&apos;re building a new family tree</DialogTitle>
          <DialogDescription>
            The people you&apos;re adding connect to you rather than to this
            family&apos;s bloodline — that&apos;s your own side of the family, and it
            deserves its own canvas. Request access and an admin will set one up,
            connected to this tree through your marriage.
          </DialogDescription>
        </DialogHeader>

        {waiting ? (
          <p className="text-sm text-muted-foreground">
            Your request is with the admins. You&apos;ll get a notification when
            your canvas is ready.
          </p>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="canvas-note">
              Anything the admins should know? (optional)
            </Label>
            <Textarea
              id="canvas-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. I'd like to add my parents and my brother's family."
              maxLength={500}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {waiting ? "Close" : "Not now"}
          </Button>
          {!waiting && (
            <Button onClick={onRequest} disabled={sending}>
              {sending ? "Sending…" : "Request access"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
