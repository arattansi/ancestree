"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useFormStatus } from "react-dom";

import { verifySignInCode, type SignInCodeState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  isWholeSignInCode,
  readSignInCode,
  SIGN_IN_CODE_LENGTH,
} from "@/lib/sign-in-code";

const INITIAL: SignInCodeState = {};

/**
 * Where the code from a sign-in email goes (Step 53), on the page that sent
 * it: typed, pasted however it was copied, or offered above the keyboard
 * (`one-time-code`: Safari fills it from Apple Mail). It sends itself once
 * it's whole, so there's nothing to press. Entering it does what the
 * email's link did: redeems `inviteToken`, else lands on `next`.
 *
 * "Send a new code" posts `resendFields` back to whatever sent the first
 * (`resendAction`), which answers on the same state, so the caller remounts
 * this with a fresh `key` for a fresh code. `onChangeEmail` offers a way
 * back to the address, where one was typed.
 */
export function SignInCodeForm({
  email,
  inviteToken,
  next,
  resendAction,
  resendFields,
  resent,
  resendError,
  onChangeEmail,
}: {
  email: string;
  inviteToken?: string;
  next?: string;
  resendAction: (formData: FormData) => void;
  resendFields: Record<string, string | undefined>;
  resent?: boolean;
  resendError?: string;
  onChangeEmail?: () => void;
}) {
  const [state, formAction, pending] = useActionState(verifySignInCode, INITIAL);
  const [code, setCode] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  // The code last sent: a wrong one isn't sent again until it's changed.
  const sentCode = useRef<string | null>(null);
  const whole = isWholeSignInCode(code);

  // After the render that shows the tidied code, so the form sends that.
  useEffect(() => {
    if (whole && sentCode.current !== code) formRef.current?.requestSubmit();
  }, [code, whole]);

  // Called by hand, not as the form's `action`: React resets an action's
  // form once it has run, which would blank the box while it still held
  // the code.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !whole) return;
    sentCode.current = code;
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  // Not while the next try is being checked: it may well be right.
  const problem = pending ? undefined : (state.error ?? resendError);

  return (
    <div className="flex flex-col gap-4">
      <div role="status" className="text-sm">
        <p className="font-medium text-foreground">Check your email</p>
        <p className="mt-1 text-muted-foreground">
          {resent ? "We sent a new code to " : "Enter the code we sent to "}
          <span className="font-medium break-words text-foreground">{email}</span>.
        </p>
      </div>

      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="email" value={email} />
        {inviteToken ? (
          <input type="hidden" name="inviteToken" value={inviteToken} />
        ) : null}
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Input
          name="code"
          aria-label="Code"
          value={code}
          onChange={(event) => setCode(readSignInCode(event.target.value))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          autoFocus
          // Not `disabled`, which would drop the focus a wrong code needs.
          readOnly={pending}
          placeholder={"0".repeat(SIGN_IN_CODE_LENGTH)}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={problem ? "sign-in-code-error" : undefined}
          className="h-12 text-center font-mono text-2xl tracking-[0.3em] placeholder:text-muted-foreground/40 md:text-2xl"
        />
        {problem ? (
          <p id="sign-in-code-error" role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        ) : null}
        <Button type="submit" disabled={pending || !whole}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <form action={resendAction}>
          {Object.entries(resendFields).map(([name, value]) =>
            value ? <input key={name} type="hidden" name={name} value={value} /> : null,
          )}
          <input type="hidden" name="resend" value="1" />
          <ResendButton />
        </form>
        {onChangeEmail ? (
          <button
            type="button"
            onClick={onChangeEmail}
            className="underline underline-offset-4 hover:text-foreground"
          >
            Use another email
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="underline underline-offset-4 hover:text-foreground disabled:no-underline disabled:opacity-60"
    >
      {pending ? "Sending…" : "Send a new code"}
    </button>
  );
}
