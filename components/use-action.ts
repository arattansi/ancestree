"use client";

import * as React from "react";
import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";

import {
  actionError,
  ERROR_TOAST_MS,
  isRedirect,
  UNREACHABLE,
} from "@/lib/action-feedback";

export type RunOptions<T> = {
  /**
   * A toast once it worked, for what happens off screen (an email sent, a
   * link copied). Leave it out where the page shows the change itself.
   */
  success?: string | ((result: T) => string | null | undefined);
  /**
   * Runs with the answer once it worked, in the same transition as the
   * action, so what it sets lands with the page's new render. A
   * `router.push` here keeps the button busy until the next page shows.
   */
  onSuccess?: (result: T) => void;
  /** Runs with the message when it didn't work. */
  onError?: (message: string) => void;
  /**
   * Keep this button busy after it worked, for good: the page is about to
   * go (a full-page navigation) or the control with it.
   */
  stayPending?: boolean;
};

export type ActionHandle = {
  /**
   * Calls a server action as button `key`. Nothing starts while another
   * call from this handle is running; a refusal (`{ error }`) or a call that
   * throws (the server couldn't be reached) is reported, as a toast, or in
   * `error` for a form that shows it inline (`useAction({ inline: true })`).
   * An action that redirects counts as done; nothing after it runs.
   */
  run: <T>(key: string, call: () => Promise<T>, options?: RunOptions<T>) => void;
  /** Some call from this handle is running: disable its buttons. */
  pending: boolean;
  /** Which button's call is running, to show that one busy. */
  pendingKey: string | null;
  /** The last failure's message when errors are inline; cleared by the next run. */
  error: string | null;
  setError: (message: string | null) => void;
};

/**
 * An error toast that stays up long enough to read (10 s, not sonner's 4).
 * For a failure with no form to show it in; a form's goes by its button
 * (`FormError`).
 */
export function toastError(message: string) {
  toast.error(message, { duration: ERROR_TOAST_MS });
}

/**
 * One way for a client component to call server actions (Step 70, audit
 * B2/R1): the pending state is per button, lasts until the page's new render
 * (or the next page) has arrived, and ends even when the call throws, so no
 * button stays stuck after a deploy.
 */
export function useAction({ inline = false }: { inline?: boolean } = {}): ActionHandle {
  const [isPending, startTransition] = React.useTransition();
  // Optimistic, so it falls back to null by itself when the transition ends,
  // however the call went.
  const [pendingKey, setPendingKey] = React.useOptimistic<string | null>(null);
  const [latchedKey, setLatchedKey] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // A second click in the same frame, before React has disabled the buttons.
  const running = React.useRef(false);

  const run = React.useCallback(
    <T,>(key: string, call: () => Promise<T>, options: RunOptions<T> = {}) => {
      if (running.current) return;
      running.current = true;
      setError(null);

      const report = (message: string) => {
        options.onError?.(message);
        if (inline) setError(message);
        else toastError(message);
      };

      startTransition(async () => {
        setPendingKey(key);
        try {
          let result: T;
          try {
            result = await call();
          } catch (thrown) {
            // The action redirected: the router is already on its way there,
            // in this same transition, so the button stays busy until the
            // page arrives. Rethrown, it would only remount the app to go
            // there a second time.
            if (isRedirect(thrown)) return;
            // notFound() and the like are Next's to show.
            unstable_rethrow(thrown);
            console.error(thrown);
            report(UNREACHABLE);
            return;
          }

          const refused = actionError(result);
          if (refused) {
            report(refused);
            return;
          }

          if (options.stayPending) setLatchedKey(key);
          if (options.onSuccess) {
            const onSuccess = options.onSuccess;
            startTransition(() => onSuccess(result));
          }
          const message =
            typeof options.success === "function"
              ? options.success(result)
              : options.success;
          if (message) toast.success(message);
        } finally {
          running.current = false;
        }
      });
    },
    [inline, setPendingKey],
  );

  const key = latchedKey ?? pendingKey;
  return {
    run,
    pending: isPending || key !== null,
    pendingKey: key,
    error,
    setError,
  };
}
