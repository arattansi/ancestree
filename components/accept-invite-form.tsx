"use client";

import { useActionState, useState } from "react";

import Link from "next/link";

import {
  acceptInvite,
  sendInviteSignInCode,
  type AcceptInviteState,
  type InviteSignInCodeState,
} from "@/app/actions/auth";
import { SignInCodeForm } from "@/components/sign-in-code-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const INITIAL: AcceptInviteState = {};
const INITIAL_CODE: InviteSignInCodeState = {};

/**
 * One-button accept for an invite that was emailed to someone: the link
 * reaching their inbox is the verification, so there is no second email.
 * `consentGiven` skips the checkbox for people who ticked it when they asked
 * to join. An address that already has an account is offered a sign-in
 * code instead (Step 30.8). Signed out, the page opens on that for such an
 * address (Step 41.2), so this only finds one that became a member's after
 * the page loaded.
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
          {/* React resets the form once its action has run, which unticked
              the checkbox's own input while the box still showed ticked, so
              a second try (after "Could not sign you in", say) was refused.
              This one follows what the box shows, as in `MagicLinkForm`
              (Step 30.7) and `InviteConsent` (Step 30.5). */}
          {consented ? <input type="hidden" name="consent" value="on" /> : null}
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
 * sign-in code; entering it here signs them in and joins (Step 53; a link
 * back here, a tap from joining, until then). The invite page opens on it
 * for someone signed out (`opensOnSignInLink`, Step 41.2): no privacy
 * tick, since a member's join asks for none.
 */
export function SignInToAccept({
  inviteToken,
  email,
}: {
  inviteToken: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(
    sendInviteSignInCode,
    INITIAL_CODE,
  );

  if (state.sentTo) {
    return (
      <SignInCodeForm
        key={state.sentAt}
        email={state.sentTo}
        inviteToken={inviteToken}
        resendAction={formAction}
        resendFields={{
          inviteToken,
          sentTo: state.sentTo,
          sentAt: state.sentAt ? String(state.sentAt) : undefined,
        }}
        resent={state.resent}
        resendError={state.resendError}
      />
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="inviteToken" value={inviteToken} />
      <div role="status" className="flex flex-col gap-1 text-sm">
        <p className="font-medium break-words text-foreground">
          {email} already has an ancestree account
        </p>
        <p className="text-muted-foreground">Sign in with it to accept this invite.</p>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Email me a code"}
      </Button>
    </form>
  );
}
