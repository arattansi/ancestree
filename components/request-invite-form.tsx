"use client";

import { useActionState, useState } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { REQUEST_INVITE_INTRO } from "@/lib/request-forms";

const INITIAL: RequestInviteState = {};

/**
 * The share link's "Ask to join" (Step 41.4): this form in a dialog over
 * the read-only canvas, so asking doesn't cost the viewer their place in
 * the tree. A visitor from another tree has the same button. The form
 * lives in the dialog, so closing it starts afresh; asking again while the
 * request waits files nothing new and emails nobody (`requestInvite`).
 */
export function RequestInviteDialog({
  treeSlug,
  signedIn = false,
  children,
  ...look
}: {
  treeSlug: string;
  /** A visitor is signed in already, so isn't offered a sign-in. */
  signedIn?: boolean;
  children: React.ReactNode;
} & Pick<React.ComponentProps<typeof Button>, "size" | "variant" | "className">) {
  return (
    <Dialog>
      <DialogTrigger render={<Button {...look} />}>{children}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
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
          A relative will review it. Once they approve, we&rsquo;ll email{" "}
          <span className="font-medium text-foreground">{state.email}</span> a
          link that takes you straight into the tree — nothing more to sign up
          for.
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

      <p className="text-sm text-muted-foreground">
        Until then we only store your name and email, so a relative can
        recognise you.
      </p>
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
