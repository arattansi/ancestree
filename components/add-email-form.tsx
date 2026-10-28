"use client";

import { useActionState, useState } from "react";

import {
  confirmAddEmailAction,
  sendAddEmailCodeAction,
  type AddEmailState,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isWholeSignInCode, readSignInCode, SIGN_IN_CODE_LENGTH } from "@/lib/sign-in-code";

const INITIAL: AddEmailState = {};

/**
 * Account → Your Email, for a member who joined without one (Step 202.4): an
 * address, then the code we send it. Entering the code makes it theirs.
 * Given `onAdded`, as My Family Tree's ask (Step 213), the page stays and
 * that's called once it's theirs; Account opens their settings again.
 */
export function AddEmailForm({ onAdded }: { onAdded?: () => void } = {}) {
  const [sent, sendAction, sending] = useActionState(sendAddEmailCodeAction, INITIAL);
  const [confirmed, confirmAction, confirming] = useActionState(
    async (prev: AddEmailState, formData: FormData) => {
      const result = await confirmAddEmailAction(prev, formData);
      // Here, not in an effect: the new address refreshes the session's
      // cookie, which re-renders the page, and the ask holding this form
      // goes with it.
      if (result.added) onAdded?.();
      return result;
    },
    INITIAL,
  );
  // "Use another email" goes back to the address, until a new code goes.
  const [changingFrom, setChangingFrom] = useState<AddEmailState | null>(null);
  const [code, setCode] = useState("");

  if (sent.sentTo && changingFrom !== sent) {
    return (
      <form key={sent.sentAt} action={confirmAction} className="flex flex-col gap-3">
        {onAdded ? <input type="hidden" name="stay" value="1" /> : null}
        <p className="text-sm text-muted-foreground">
          We sent a code to{" "}
          <span className="font-medium break-words text-foreground">{sent.sentTo}</span>.
        </p>
        <Input
          name="code"
          aria-label="Code"
          value={code}
          onChange={(event) => setCode(readSignInCode(event.target.value))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          autoFocus
          readOnly={confirming}
          placeholder={"0".repeat(SIGN_IN_CODE_LENGTH)}
          aria-invalid={confirmed.error ? true : undefined}
          aria-describedby={confirmed.error ? "add-email-code-error" : undefined}
          className="h-12 text-center font-mono text-2xl tracking-[0.3em] placeholder:text-muted-foreground/40 md:text-2xl"
        />
        {confirmed.error ? (
          <p id="add-email-code-error" role="alert" className="text-sm text-destructive">
            {confirmed.error}
          </p>
        ) : null}
        <Button type="submit" disabled={confirming || !isWholeSignInCode(code)}>
          {confirming ? "adding…" : "add email"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setChangingFrom(sent);
            setCode("");
          }}
          className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Use another email
        </button>
      </form>
    );
  }

  return (
    <form action={sendAction} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="add-email">Email address</Label>
        <Input
          id="add-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={changingFrom?.sentTo}
          aria-invalid={sent.error ? true : undefined}
          aria-describedby={sent.error ? "add-email-error" : undefined}
          placeholder="you@example.com"
        />
      </div>
      {sent.error ? (
        <p id="add-email-error" role="alert" className="text-sm text-destructive">
          {sent.error}
        </p>
      ) : null}
      <Button type="submit" disabled={sending}>
        {sending ? "sending…" : "email me a code"}
      </Button>
    </form>
  );
}
