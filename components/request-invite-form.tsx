"use client";

import { useActionState } from "react";
import Link from "next/link";

import { requestInvite, type RequestInviteState } from "@/app/actions/invite-requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: RequestInviteState = {};

export function RequestInviteForm() {
  const [state, formAction, pending] = useActionState(requestInvite, INITIAL);

  if (state.ok) {
    return (
      <div
        role="status"
        className="rounded-lg border border-border bg-muted/40 p-4 text-sm"
      >
        <p className="font-medium text-foreground">Request sent</p>
        <p className="mt-1 text-muted-foreground">
          An admin will review it. If they recognise you, they will send an
          invite link to{" "}
          <span className="font-medium text-foreground">{state.email}</span>.
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

      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Request an invite"}
      </Button>

      <p className="text-sm text-muted-foreground">
        We only store your name and email so an admin can recognise you. See the{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          privacy notice
        </Link>
        .
      </p>
    </form>
  );
}
