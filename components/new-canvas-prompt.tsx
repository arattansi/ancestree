"use client";

import * as React from "react";
import { toast } from "sonner";

import { registerCanvasInterest } from "@/app/actions/canvas-interest";
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
 * Shown when the bloodline gate refuses an add (Step 14). What they were doing
 * is starting their own family tree, which Ancestree doesn't do yet — so this
 * says so plainly and offers to note their interest, which is the only honest
 * thing to promise while we're still finding out whether there's a market for
 * it (Step 14.3). Nothing here grants anything.
 */
export function NewCanvasPrompt({
  open,
  onOpenChange,
  alreadyRegistered = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** They have already put their name down. */
  alreadyRegistered?: boolean;
}) {
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  async function onRegister() {
    setSaving(true);
    const res = await registerCanvasInterest(note);
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setSaved(true);
    toast.success("Noted — thank you. We'll be in touch if this opens up.");
  }

  const done = saved || alreadyRegistered;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Looks like you&apos;re building a new family tree</DialogTitle>
          <DialogDescription>
            The people you&apos;re adding connect to you rather than to this
            family&apos;s bloodline — that&apos;s your own side of the family, and it
            needs a tree of its own. Ancestree only keeps this one tree for now.
            If you&apos;d want your own, say so and we&apos;ll come back to you if we
            build it.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <p className="text-sm text-muted-foreground">
            You&apos;re on the list. In the meantime you can still add your own
            children here, and anyone on your partner&apos;s side of the family.
          </p>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="canvas-note">
              Who would you add? (optional, but it helps us)
            </Label>
            <Textarea
              id="canvas-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. my parents, my brother's family, and my grandparents in Mombasa."
              maxLength={500}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {done ? "Close" : "No thanks"}
          </Button>
          {!done && (
            <Button onClick={onRegister} disabled={saving}>
              {saving ? "Saving…" : "I'd want my own tree"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
