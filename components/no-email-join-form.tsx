"use client";

import { useActionState, useState } from "react";

import Link from "next/link";

import { joinWithoutEmailAction } from "@/app/actions/auth";
import { JoinConsent, NameFields } from "@/components/request-fields";
import { Button } from "@/components/ui/button";
import type { RequestFormState } from "@/lib/request-forms";
import { inviteHref, signInHref } from "@/lib/sign-in-links";

const INITIAL: RequestFormState = {};

/**
 * A claim link's or the family link's form (Step 202): a name and the
 * privacy notice, and they're in. Since Step 213 it's how everyone joins
 * from those links, on a phone with no trip to their inbox; My Family Tree
 * asks for an email after (`EmailAskCard`). Someone with an account signs
 * in instead, and comes back to the invite signed in; `onUseEmail`, given
 * when they came from the email form, goes back to it.
 */
export function NoEmailJoinForm({
  inviteToken,
  submitLabel = "join",
  onUseEmail,
}: {
  inviteToken: string;
  submitLabel?: string;
  onUseEmail?: () => void;
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
        {pending ? "joining…" : submitLabel}
      </Button>
      <p className="text-sm text-muted-foreground">
        Have an account?{" "}
        <Link
          href={signInHref(inviteHref(inviteToken))}
          className="underline underline-offset-4 hover:text-foreground"
        >
          Sign in
        </Link>
        {onUseEmail ? (
          <>
            {" · "}
            <button
              type="button"
              onClick={onUseEmail}
              className="underline underline-offset-4 hover:text-foreground"
            >
              Use email
            </button>
          </>
        ) : null}
      </p>
    </form>
  );
}
