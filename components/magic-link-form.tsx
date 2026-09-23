"use client";

import { useActionState, useState } from "react";

import Link from "next/link";

import { requestMagicLink, type MagicLinkState } from "@/app/actions/auth";
import { NameEmailFields } from "@/components/request-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAsksName } from "@/lib/joining-name";
import { signInNeedsConsent } from "@/lib/privacy-consent";

const INITIAL: MagicLinkState = {};

/**
 * Asks for an email and sends a one-time sign-in link. Given `inviteToken`,
 * it's a bare invite link's form: that person is joining the tree, so they
 * agree to the privacy notice here (Step 30.4), and give their name beside
 * the email, which names their account and is what onboarding searches the
 * tree for (Step 30.7). A plain sign-in asks for the email alone and only
 * links to the notice.
 */
export function MagicLinkForm({
  inviteToken,
  next,
  submitLabel = "Email me a sign-in link",
}: {
  inviteToken?: string;
  /** A same-origin path to land on once signed in (Step 30.1). */
  next?: string;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(requestMagicLink, INITIAL);
  const [consented, setConsented] = useState(false);
  const needsConsent = signInNeedsConsent(inviteToken);
  const asksName = signInAsksName(inviteToken);

  if (state.ok) {
    return (
      <div
        role="status"
        className="rounded-lg border border-border bg-muted/40 p-4 text-sm"
      >
        <p className="font-medium text-foreground">Check your email</p>
        <p className="mt-1 text-muted-foreground">
          We sent a sign-in link to{" "}
          <span className="font-medium text-foreground">{state.email}</span>. Open
          it on this device to continue.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {inviteToken ? (
        <input type="hidden" name="inviteToken" value={inviteToken} />
      ) : null}
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
          {/* React resets the form once its action has run, which unticks the
              checkbox's own input while the box still shows ticked, so a
              second try (after a missing name, say) was refused. This one
              follows what the box shows (Step 30.7). */}
          {consented ? <input type="hidden" name="consent" value="on" /> : null}
        </Label>
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
        {pending ? "Sending…" : submitLabel}
      </Button>
    </form>
  );
}
