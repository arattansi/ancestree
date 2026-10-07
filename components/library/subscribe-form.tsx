"use client";

import * as React from "react";

import { subscribeToStories, type SubscribeState } from "@/app/actions/library-subscribe";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { blogFeedHref } from "@/lib/blog";
import { MAX_EMAIL_LENGTH } from "@/lib/email-address";

/**
 * Subscribe to the library (Step 135): by email, confirmed by a link, or
 * by RSS. Once sent, the form says to look for the email, whatever the
 * list held.
 */
export function SubscribeForm() {
  const [state, action, pending] = React.useActionState<SubscribeState, FormData>(
    subscribeToStories,
    {},
  );

  return (
    <div className="flex flex-col gap-3 text-sm">
      {state.ok ? (
        <p className="text-muted-foreground">
          Check your email for a link to confirm it.
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-2" noValidate>
          <Label htmlFor="library-subscribe-email">
            A story in your inbox whenever one is published
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="library-subscribe-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              defaultValue={state.email ?? ""}
              maxLength={MAX_EMAIL_LENGTH}
              disabled={pending}
              required
              className="sm:max-w-xs"
            />
            <PendingButton type="submit" pending={pending} pendingLabel="subscribing…">
              subscribe
            </PendingButton>
          </div>
          <FormError>{state.error}</FormError>
        </form>
      )}
      <p className="text-xs text-muted-foreground">
        Or follow the{" "}
        <a href={blogFeedHref()} className="underline underline-offset-4 hover:text-foreground">
          RSS feed
        </a>
        .
      </p>
    </div>
  );
}
