"use client";

import { useActionState, useState } from "react";

import Link from "next/link";

import {
  forgetSentSignInCode,
  requestMagicLink,
  type MagicLinkState,
} from "@/app/actions/auth";
import { NoEmailJoinForm } from "@/components/no-email-join-form";
import { JoinConsent, NameEmailFields } from "@/components/request-fields";
import { SignInCodeForm } from "@/components/sign-in-code-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAsksName } from "@/lib/joining-name";
import { signInNeedsConsent } from "@/lib/privacy-consent";
import type { SentCode } from "@/lib/sent-code";

const INITIAL: MagicLinkState = {};

/**
 * Asks for an email and sends a one-time sign-in code, then takes the code
 * (Step 53; a link until then). Given `inviteToken`, it's a bare invite
 * link's form: that person is joining the tree, so they agree to the
 * privacy notice here (Step 30.4), and give their name beside the email,
 * which names their account and is what onboarding searches the tree for
 * (Step 30.7). So is a campaign link's (`campaign`, Step 103.3), whose
 * sign-up starts a tree of their own. A plain sign-in asks for the email
 * alone and only links to the notice.
 *
 * Given `sent`, a code this page's form emailed within the hour (Step 164,
 * `MagicLinkSignIn` reads it), it opens on the code box, as it was before
 * the page was reloaded.
 *
 * Given `noEmail`, a claim link or the family link, it offers "No email?":
 * joining with a name alone (Step 202, `NoEmailJoinForm`).
 */
export function MagicLinkForm({
  inviteToken,
  campaign,
  next,
  submitLabel = "email me a code",
  sent,
  noEmail = false,
}: {
  inviteToken?: string;
  /** A campaign link's code: signing in starts their tree (Step 103.3). */
  campaign?: string;
  /** A same-origin path to land on once signed in (Step 30.1). */
  next?: string;
  submitLabel?: string;
  /** A code already on its way from this form: see above. */
  sent?: SentCode;
  /** Someone with no email may take this invite (`noEmailMayJoin`). */
  noEmail?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    requestMagicLink,
    sent
      ? {
          ok: true,
          email: sent.email,
          firstName: sent.firstName,
          lastName: sent.lastName,
          sentAt: sent.sentAt,
        }
      : INITIAL,
  );
  const [consented, setConsented] = useState(false);
  // "Use another email" goes back to the form, filled in as it was, until
  // it sends again and a new state comes back.
  const [changingFrom, setChangingFrom] = useState<MagicLinkState | null>(null);
  const needsConsent = signInNeedsConsent(inviteToken || campaign);
  const asksName = signInAsksName(inviteToken || campaign);
  const [withoutEmail, setWithoutEmail] = useState(false);

  if (noEmail && inviteToken && withoutEmail) {
    return (
      <NoEmailJoinForm inviteToken={inviteToken} onUseEmail={() => setWithoutEmail(false)} />
    );
  }

  if (state.ok && state.email && changingFrom !== state) {
    return (
      <SignInCodeForm
        // A new code, a fresh box.
        key={state.sentAt}
        email={state.email}
        inviteToken={inviteToken}
        campaign={campaign}
        next={next}
        resendAction={formAction}
        resendFields={{
          email: state.email,
          firstName: state.firstName,
          lastName: state.lastName,
          inviteToken,
          campaign,
          next,
          consent: needsConsent ? "on" : undefined,
          sentAt: state.sentAt ? String(state.sentAt) : undefined,
        }}
        resent={state.resent}
        resendError={state.resendError}
        onChangeEmail={() => {
          setChangingFrom(state);
          void forgetSentSignInCode();
        }}
      />
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {inviteToken ? (
        <input type="hidden" name="inviteToken" value={inviteToken} />
      ) : null}
      {campaign ? <input type="hidden" name="campaign" value={campaign} /> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {asksName ? (
        <>
          <NameEmailFields
            idPrefix="join"
            state={state}
            errorId={state.error ? "join-error" : undefined}
          />
          {state.error ? (
            <p id="join-error" role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={state.email}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "email-error" : undefined}
            placeholder="you@example.com"
          />
          {state.error ? (
            <p id="email-error" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
        </div>
      )}
      {needsConsent ? (
        <JoinConsent
          id="consent"
          checked={consented}
          onCheckedChange={setConsented}
          starting={Boolean(campaign)}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          Read how your family&rsquo;s data is stored and protected in the{" "}
          <Link
            href="/privacy"
            target="_blank"
            className="underline underline-offset-4"
          >
            privacy notice
          </Link>
          .
        </p>
      )}

      <Button type="submit" disabled={pending || (needsConsent && !consented)}>
        {pending ? "sending…" : submitLabel}
      </Button>
      {noEmail && inviteToken ? (
        <button
          type="button"
          onClick={() => setWithoutEmail(true)}
          className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          No email?
        </button>
      ) : null}
    </form>
  );
}
