"use client";

import { useActionState } from "react";
import Link from "next/link";

import { joinBetaWaitlist, type WaitlistState } from "@/app/actions/tree-requests";
import { NameEmailFields } from "@/components/request-fields";
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
          Starting a family tree of your own is in beta. Join the waitlist, and
          we&rsquo;ll email you when you can start building yours.
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
        <p className="text-xs text-muted-foreground">
          We only use your name and email to tell you when you can start. See
          the{" "}
          <Link href="/privacy" target="_blank" className="underline underline-offset-4">
            privacy notice
          </Link>
          .
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Join the waitlist"}
        </Button>
      </form>
    </>
  );
}
