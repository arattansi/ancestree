"use client";

import * as React from "react";
import { toast } from "sonner";

import { closeEmailAsk } from "@/app/actions/auth";
import { AddEmailForm } from "@/components/add-email-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * On My Family Tree for an account that joined with a name alone (Step
 * 213): add an email, so they can sign back in on another phone or browser
 * without asking a Root for a link. "add email" opens Account's own form
 * (Step 202.4) over the canvas; closing the card is kept on the account
 * (`closeEmailAsk`), so it's asked once, and Account → Your Email stays.
 */
export function EmailAskCard() {
  const [closed, setClosed] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  if (closed) return null;

  // The page re-renders without the ask as the session's cookie is
  // refreshed (an action that sets one does), so there's nothing to reload.
  function added() {
    setOpen(false);
    setClosed(true);
    toast.success("Email added.");
  }

  function dismiss() {
    setClosed(true);
    React.startTransition(() => {
      void closeEmailAsk();
    });
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
      {/* The button goes under the words when they'd squeeze it. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-[1_1_10rem] text-foreground">
          Add your email so you can sign back in.
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          add email
        </Button>
      </div>
      <button
        type="button"
        className="relative tap-target text-muted-foreground hover:text-foreground"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        ✕
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add your email</DialogTitle>
          </DialogHeader>
          <AddEmailForm onAdded={added} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
