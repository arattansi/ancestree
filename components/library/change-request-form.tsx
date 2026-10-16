"use client";

import * as React from "react";

import { askLibraryChange } from "@/app/actions/library-submissions";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import { LIBRARY_CHANGE_MAX } from "@/lib/limits";

/**
 * Ask for a change to a story sent in (Step 157), from its copy's page:
 * the sender says what, and the beta reviewers see it on the admin page.
 * It changes nothing by itself; the page lists it once sent.
 */
export function ChangeRequestForm({ token }: { token: string }) {
  const action = useAction({ inline: true });
  const [message, setMessage] = React.useState("");
  const [sent, setSent] = React.useState(false);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    action.run("send", () => askLibraryChange(token, message), {
      onSuccess: () => {
        setMessage("");
        setSent(true);
      },
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <Label htmlFor="change-message">Ask for a change</Label>
      <Textarea
        id="change-message"
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          setSent(false);
        }}
        rows={4}
        maxLength={LIBRARY_CHANGE_MAX}
        disabled={action.pending}
        required
      />
      <FormError>{action.error}</FormError>
      <div className="flex flex-wrap items-center gap-3">
        <PendingButton
          type="submit"
          size="sm"
          pending={action.pending}
          pendingLabel="sending…"
          disabled={!message.trim()}
        >
          send
        </PendingButton>
        {sent ? (
          <p role="status" className="text-sm text-muted-foreground">
            Sent.
          </p>
        ) : null}
      </div>
    </form>
  );
}
