"use client";

import { useActionState, useState } from "react";

import Link from "next/link";

import { acceptInvite, type AcceptInviteState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const INITIAL: AcceptInviteState = {};

/**
 * One-button accept for an invite that was emailed to someone: the link
 * reaching their inbox is the verification, so there is no second email.
 * `consentGiven` skips the checkbox for people who ticked it when they asked
 * to join.
 */
export function AcceptInviteForm({
  inviteToken,
  email,
  consentGiven,
}: {
  inviteToken: string;
  email: string;
  consentGiven: boolean;
}) {
  const [state, formAction, pending] = useActionState(acceptInvite, INITIAL);
  const [consented, setConsented] = useState(consentGiven);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="inviteToken" value={inviteToken} />
      <p className="text-sm text-muted-foreground">
        You&rsquo;ll join as{" "}
        <span className="font-medium text-foreground">{email}</span>.
      </p>

      {consentGiven ? (
        <input type="hidden" name="consent" value="on" />
      ) : (
        <Label
          htmlFor="consent"
          className="group/field-label flex items-start gap-2.5 text-sm font-normal text-muted-foreground"
        >
          <Checkbox
            id="consent"
            name="consent"
            checked={consented}
            onCheckedChange={(value) => setConsented(value === true)}
            className="mt-0.5"
          />
          <span>
            I agree that my family details, photos, and documents will be shared
            with other members of this private tree, and I have read the{" "}
            <Link
              href="/privacy"
              target="_blank"
              className="underline underline-offset-4"
            >
              privacy notice
            </Link>
            .
          </span>
        </Label>
      )}

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}{" "}
          {state.alreadyMember ? (
            <Link href="/join" className="underline underline-offset-4">
              Sign in instead
            </Link>
          ) : null}
        </p>
      ) : null}

      <Button type="submit" disabled={pending || !consented}>
        {pending ? "Opening the tree…" : "Accept & open the tree"}
      </Button>
    </form>
  );
}
