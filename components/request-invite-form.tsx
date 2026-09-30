"use client";

import { useActionState, useState, type RefObject } from "react";
import Link from "next/link";

import { requestInvite, type RequestInviteState } from "@/app/actions/invite-requests";
import { InviteConsent, NameEmailFields } from "@/components/request-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { REQUEST_INVITE_INTRO } from "@/lib/request-forms";

const INITIAL: RequestInviteState = {};

/**
 * The share link's "Ask to join" dialog (Step 41.4), opened by
 * `RequestInviteDialog`'s button, which fetches this module only once the
 * canvas has painted (Step 87.4). The form lives in the dialog, so closing
 * it starts afresh; asking again while the request waits files nothing new
 * and emails nobody (`requestInvite`).
 */
export function RequestInviteDialogPopup({
  open,
  onOpenChange,
  treeSlug,
  signedIn,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treeSlug: string;
  signedIn: boolean;
  /** The button that opened it, where focus goes back to. */
  finalFocus: RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        finalFocus={finalFocus}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Ask to join</DialogTitle>
          <DialogDescription>{REQUEST_INVITE_INTRO}</DialogDescription>
        </DialogHeader>
        <RequestInviteForm treeSlug={treeSlug} />
        {signedIn ? null : <SignInInstead />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Ask one tree's Roots for an invite, named by its slug — the share link's
 * "Ask to join", in its dialog, and `/request-invite?tree=`, which emails
 * and older links open. Without a tree, the page shows the search instead
 * (`RequestAccessFlow`).
 */
export function RequestInviteForm({ treeSlug }: { treeSlug: string }) {
  const [state, formAction, pending] = useActionState(requestInvite, INITIAL);
  const [consented, setConsented] = useState(false);

  if (state.ok) {
    return (
      <div
        role="status"
        className="rounded-lg border border-border bg-muted/40 p-4 text-sm"
      >
        <p className="font-medium text-foreground">Request sent</p>
        <p className="mt-1 text-muted-foreground">
          Once a relative approves, we&rsquo;ll email{" "}
          <span className="font-medium text-foreground">{state.email}</span> a
          link to the tree.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="tree" value={treeSlug} />
      <NameEmailFields
        idPrefix="request-invite"
        state={state}
        errorId={state.error ? "request-invite-error" : undefined}
      />

      {state.error ? (
        <p id="request-invite-error" role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <InviteConsent
        id="request-invite-consent"
        checked={consented}
        onCheckedChange={setConsented}
      />

      <Button type="submit" disabled={pending || !consented}>
        {pending ? "Sending…" : "Request an invite"}
      </Button>
    </form>
  );
}

/** Under the form, for someone who has an invite already. */
export function SignInInstead() {
  return (
    <p className="text-sm text-muted-foreground">
      Already have an invite?{" "}
      <Link href="/join" className="underline underline-offset-4">
        Sign in
      </Link>
    </p>
  );
}
