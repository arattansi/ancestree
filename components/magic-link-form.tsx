"use client";

import { useActionState } from "react";

import { requestMagicLink, type MagicLinkState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: MagicLinkState = {};

export function MagicLinkForm({
  inviteToken,
  submitLabel = "Email me a sign-in link",
}: {
  inviteToken?: string;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(requestMagicLink, INITIAL);

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
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : submitLabel}
      </Button>
    </form>
  );
}
