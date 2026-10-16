"use client";

import * as React from "react";
import Link from "next/link";

import { renewInvite } from "@/app/actions/invites";
import { ActionButton } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import type { LapsedState } from "@/lib/lapsed-invites";

/**
 * An expired invite's way on (Step 163): a fresh link to the address it was
 * for, which the page shows masked; a note that one went today; sign in,
 * for an address on the tree already; or who to ask.
 */
export function RenewInvite({
  token,
  state: initial,
  maskedEmail,
  inviterName,
  treeName,
}: {
  token: string;
  state: LapsedState;
  maskedEmail: string;
  inviterName: string;
  treeName: string;
}) {
  const [state, setState] = React.useState<LapsedState>(initial);
  const address = <span className="font-medium break-words text-foreground">{maskedEmail}</span>;

  if (state === "sent") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        A fresh link went to {address}. Check that inbox.
      </p>
    );
  }
  if (state === "joined") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {address} is on {treeName} already.
        </p>
        <Button nativeButton={false} render={<Link href="/join" />} className="w-full">
          sign in
        </Button>
      </div>
    );
  }
  if (state === "closed") {
    return (
      <p className="text-sm text-muted-foreground">
        Ask {inviterName} for a new invite.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        We can email a fresh link to {address}.
      </p>
      <ActionButton
        action={() => renewInvite(token)}
        pendingLabel="sending…"
        className="w-full"
        onSuccess={(result) => setState(result.sent ? "sent" : (result.state ?? "closed"))}
      >
        send a fresh link
      </ActionButton>
    </div>
  );
}
