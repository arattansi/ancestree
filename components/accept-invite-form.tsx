"use client";

import { useActionState, useState } from "react";

import Link from "next/link";

import {
  acceptInvite,
  sendInviteSignInLink,
  type AcceptInviteState,
  type InviteSignInLinkState,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const INITIAL: AcceptInviteState = {};
const INITIAL_LINK: InviteSignInLinkState = {};

/**
 * One-button accept for an invite that was emailed to someone: the link
 * reaching their inbox is the verification, so there is no second email.
 * `consentGiven` skips the checkbox for people who ticked it when they asked
 * to join. An address that already has an account is offered a sign-in
 * link instead, which comes back here (Step 30.8).
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

  if (state.alreadyMember) {
    return <SignInToAccept inviteToken={inviteToken} email={email} />;
  }

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
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending || !consented}>
        {pending ? "Opening the tree…" : "Accept & open the tree"}
      </Button>
    </form>
  );
}

/**
 * The address already has an account, which the invite won't sign in on
 * its own say-so (`signInWithInvite`). Rather than send them to /join to
 * type it again and lose the invite on the way, email that address a
 * sign-in link that comes back here, signed in and a tap from joining
 * (Step 30.8).
 */
function SignInToAccept({
  inviteToken,
  email,
}: {
  inviteToken: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(
    sendInviteSignInLink,
    INITIAL_LINK,
  );

  if (state.sentTo) {
    return (
      <div
        role="status"
        className="rounded-lg border border-border bg-muted/40 p-4 text-sm"
      >
        <p className="font-medium text-foreground">Check your email</p>
        <p className="mt-1 text-muted-foreground">
          We sent a sign-in link to{" "}
          <span className="font-medium text-foreground">{state.sentTo}</span>.
          Open it on this device: it signs you in and brings you back to this
          invite, to accept it with one tap.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="inviteToken" value={inviteToken} />
      <div role="status" className="flex flex-col gap-1 text-sm">
        <p className="font-medium break-words text-foreground">
          {email} already has an ancestree account
        </p>
        <p className="text-muted-foreground">
          Sign in with it to accept this invite. We&rsquo;ll email you a link
          that brings you back here, signed in.
        </p>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
