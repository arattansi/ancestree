"use client";

import * as React from "react";

import { decideEntrySuggestion } from "@/app/actions/suggestions";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import { SUGGESTION_NOTE_MAX } from "@/lib/limits";
import {
  refocusAfterRemoval,
  useFocusReturn,
} from "@/components/use-focus-return";

/**
 * Accept or decline a suggested change (Step 67), on the entry's card or in
 * the notice that asks. Declining first asks why (Step 69); the suggester
 * reads it in the notice that tells them, and it can be left empty.
 *
 * Answered, it goes, and the card or notice says how it went, so no toast
 * repeats it (Step 70). Focus goes to `onAnswered`'s choice, or on to the
 * next row of the list it was in.
 */
export function SuggestionAnswer({
  suggestionId,
  onAnswered,
}: {
  suggestionId: string;
  /** Once answered: where focus goes, for a row that stays on the page. */
  onAnswered?: () => void;
}) {
  const [declining, setDeclining] = React.useState(false);
  const [reason, setReason] = React.useState("");
  // What goes wrong shows by these buttons.
  const action = useAction({ inline: true });
  const returnFocus = useFocusReturn();
  const declineRef = React.useRef<HTMLButtonElement>(null);
  const reasonId = `decline-reason-${suggestionId}`;

  function answer(accept: boolean, pressed: HTMLElement) {
    action.run(
      accept ? "accept" : "decline",
      () =>
        decideEntrySuggestion(
          suggestionId,
          accept,
          accept ? undefined : reason,
        ),
      {
        onSuccess: () => {
          if (onAnswered) onAnswered();
          else refocusAfterRemoval(pressed);
        },
      },
    );
  }

  if (!declining) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <PendingButton
            size="sm"
            pending={action.pendingKey === "accept"}
            disabled={action.pending}
            pendingLabel="accepting…"
            onClick={(e) => answer(true, e.currentTarget)}
          >
            accept
          </PendingButton>
          <Button
            ref={declineRef}
            size="sm"
            variant="outline"
            disabled={action.pending}
            onClick={() => {
              setDeclining(true);
              action.setError(null);
              // The buttons make way for the reason: its box takes focus.
              returnFocus(() => document.getElementById(reasonId));
            }}
          >
            decline
          </Button>
        </div>
        <FormError>{action.error}</FormError>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        answer(false, submitter instanceof HTMLElement ? submitter : e.currentTarget);
      }}
    >
      <Label htmlFor={reasonId} className="text-xs">
        Reason (optional)
      </Label>
      <Input
        id={reasonId}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={SUGGESTION_NOTE_MAX}
        disabled={action.pending}
      />
      <FormError>{action.error}</FormError>
      <div className="flex flex-wrap gap-2">
        <PendingButton
          type="submit"
          size="sm"
          variant="outline"
          pending={action.pending}
          pendingLabel="declining…"
        >
          decline
        </PendingButton>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={action.pending}
          onClick={() => {
            setDeclining(false);
            setReason("");
            action.setError(null);
            returnFocus(() => declineRef.current);
          }}
        >
          cancel
        </Button>
      </div>
    </form>
  );
}
