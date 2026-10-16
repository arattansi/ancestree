"use client";

import { useActionState, useState } from "react";

import {
  acceptInvite,
  sendInviteSignInCode,
  type AcceptInviteState,
  type InviteSignInCodeState,
} from "@/app/actions/auth";
import { JoinConsent } from "@/components/request-fields";
import { SignInCodeForm } from "@/components/sign-in-code-form";
import { Button } from "@/components/ui/button";
import type { SentCode } from "@/lib/sent-code";

const INITIAL: AcceptInviteState = {};
const INITIAL_CODE: InviteSignInCodeState = {};

/**
 * One-button accept for an invite that was emailed to someone: the link
 * reaching their inbox is the verification, so there is no second email.
 * `consentGiven` skips the checkbox for people who ticked it when they asked
 * to join. An address that already has an account is offered a sign-in
 * code instead (Step 30.8). Signed out, the page opens on that for such an
 * address (Step 41.2), so this only finds one that became a member's after
 * the page loaded. `founds`: the invite starts a tree of their own.
 */
export function AcceptInviteForm({
  inviteToken,
  email,
  consentGiven,
  founds = false,
}: {
  inviteToken: string;
  email: string;
  consentGiven: boolean;
  founds?: boolean;
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
        // `consent` follows what the box shows, not the checkbox's own
        // input, which React unticks when it resets the form after a try
        // ("Could not sign you in", say). A founder's tree starts empty, so
        // it's shared with the family who join it (Step 165).
        <JoinConsent
          id="consent"
          checked={consented}
          onCheckedChange={setConsented}
          starting={founds}
        />
      )}

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending || !consented}>
        {pending ? "opening the tree…" : "accept & open the tree"}
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
 *
 * Given `sent`, the code this invite emailed its address within the hour
 * (Step 165, as `MagicLinkForm`'s, Step 164), it opens on the code box, so
 * a reload on "Check your email" doesn't drop it.
 */
export function SignInToAccept({
  inviteToken,
  email,
  sent,
}: {
  inviteToken: string;
  email: string;
  sent?: SentCode;
}) {
  const [state, formAction, pending] = useActionState(
    sendInviteSignInCode,
    sent ? { sentTo: sent.email, sentAt: sent.sentAt } : INITIAL_CODE,
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
        {pending ? "sending…" : "email me a code"}
      </Button>
    </form>
  );
}
