"use client";

import { useActionState, useState } from "react";

import { joinWithoutEmailAction } from "@/app/actions/auth";
import { JoinConsent, NameFields } from "@/components/request-fields";
import { Button } from "@/components/ui/button";
import type { RequestFormState } from "@/lib/request-forms";

const INITIAL: RequestFormState = {};

/**
 * A claim link's or the family link's form for someone with no email (Step
 * 202): their name and the privacy notice, and they're in. `onUseEmail` goes
 * back to the email form.
 */
export function NoEmailJoinForm({
  inviteToken,
  onUseEmail,
}: {
  inviteToken: string;
  onUseEmail: () => void;
}) {
  const [state, formAction, pending] = useActionState(joinWithoutEmailAction, INITIAL);
  const [consented, setConsented] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="inviteToken" value={inviteToken} />
      <NameFields
        idPrefix="no-email"
        state={state}
        errorId={state.error ? "no-email-error" : undefined}
      />
      {state.error ? (
        <p id="no-email-error" role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <JoinConsent id="no-email-consent" checked={consented} onCheckedChange={setConsented} />
      <Button type="submit" disabled={pending || !consented}>
        {pending ? "joining…" : "join without email"}
      </Button>
      <button
        type="button"
        onClick={onUseEmail}
        className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Use email
      </button>
    </form>
  );
}
