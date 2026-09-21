"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { requestInvite, type RequestInviteState } from "@/app/actions/invite-requests";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: RequestInviteState = {};

export function RequestInviteForm() {
  const [state, formAction, pending] = useActionState(requestInvite, INITIAL);
  const [consented, setConsented] = useState(false);

  if (state.ok) {
    return (
      <div
        role="status"
        className="rounded-lg border border-border bg-muted/40 p-4 text-sm"
      >
        <p className="font-medium text-foreground">Request sent</p>
        <p className="mt-1 text-muted-foreground">
          A relative will review it. Once they approve, we&rsquo;ll email{" "}
          <span className="font-medium text-foreground">{state.email}</span> a
          link that takes you straight into the tree — nothing more to sign up
          for.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            autoComplete="given-name"
            required
            defaultValue={state.firstName}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            name="lastName"
            autoComplete="family-name"
            required
            defaultValue={state.lastName}
          />
        </div>
      </div>
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
          placeholder="you@example.com"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "request-invite-error" : undefined}
        />
      </div>

      {state.error ? (
        <p id="request-invite-error" role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

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
          If I&rsquo;m approved, I agree that my family details, photos, and
          documents will be shared with other members of this private tree, and
          I have read the{" "}
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

      <Button type="submit" disabled={pending || !consented}>
        {pending ? "Sending…" : "Request an invite"}
      </Button>

      <p className="text-sm text-muted-foreground">
        Until then we only store your name and email, so a relative can
        recognise you.
      </p>
    </form>
  );
}
