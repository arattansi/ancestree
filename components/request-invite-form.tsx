"use client";

import { useActionState, useState } from "react";

import { requestInvite, type RequestInviteState } from "@/app/actions/invite-requests";
import { InviteConsent, NameEmailFields } from "@/components/request-fields";
import { Button } from "@/components/ui/button";

const INITIAL: RequestInviteState = {};

/**
 * Ask one tree's Roots for an invite, named by its slug — the share link's
 * "request access" and a visitor's "request edit access". Without a tree,
 * the page shows the search instead (`RequestAccessFlow`).
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
