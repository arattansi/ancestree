"use client";

import { useActionState } from "react";

import { signInWithLink, type SignInLinkState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

const INITIAL: SignInLinkState = {};

/** The one button on a sign-in link's page (Step 202.3): it spends the link. */
export function SignInLinkForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(signInWithLink, INITIAL);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "signing in…" : "sign in"}
      </Button>
    </form>
  );
}
