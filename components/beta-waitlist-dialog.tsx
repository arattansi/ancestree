"use client";

import { useActionState, useState } from "react";

import { joinBetaWaitlist, type WaitlistState } from "@/app/actions/tree-requests";
import { InviteConsent, NameEmailFields } from "@/components/request-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { waitlistReceived } from "@/lib/tree-requests";

const INITIAL: WaitlistState = {};

/**
 * "start a tree (beta)" for someone signed out (Step 28): the waitlist to
 * start a family tree of their own. A reviewer answers with a founder invite
 * by email. The form lives in the dialog, so closing it starts afresh.
 */
export function BetaWaitlistDialog({
  children,
  ...look
}: {
  children: React.ReactNode;
} & Pick<React.ComponentProps<typeof Button>, "size" | "variant" | "className">) {
  return (
    <Dialog>
      <DialogTrigger render={<Button {...look} />}>{children}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <WaitlistForm />
      </DialogContent>
    </Dialog>
  );
}

function WaitlistForm() {
  const [state, formAction, pending] = useActionState(joinBetaWaitlist, INITIAL);
  // The founder invite a yes sends skips the box on the join page, so it's
  // ticked here, as when asking to join a tree (Step 30.6).
  const [consented, setConsented] = useState(false);

  if (state.ok && state.email) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Request received</DialogTitle>
          <DialogDescription>{waitlistReceived(state.email)}</DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton />
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Start a tree</DialogTitle>
        <DialogDescription>
          New trees are in beta.
          <br />
          Join the waitlist and we&rsquo;ll email you when you can start.
        </DialogDescription>
      </DialogHeader>
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <NameEmailFields
          idPrefix="waitlist"
          state={state}
          errorId={state.error ? "waitlist-error" : undefined}
        />
        {state.error ? (
          <p id="waitlist-error" role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <InviteConsent
          id="waitlist-consent"
          checked={consented}
          onCheckedChange={setConsented}
        />
        <Button type="submit" disabled={pending || !consented}>
          {pending ? "Sending…" : "Join the waitlist"}
        </Button>
      </form>
    </>
  );
}
