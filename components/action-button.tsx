"use client";

import type { ComponentProps } from "react";

import { PendingButton } from "@/components/pending-button";
import { useAction, type RunOptions } from "@/components/use-action";
import { refocusAfterRemoval } from "@/components/use-focus-return";

/**
 * A button that calls one server action (Step 70, audit R1): busy with a
 * spinner until the page's new render has arrived, never stuck after a
 * failure, which it reports in a toast. For a button with a question first,
 * use `ConfirmButton`.
 */
export function ActionButton<T>({
  action: call,
  success,
  onSuccess,
  onError,
  stayPending,
  removesRow = false,
  fallbackFocus,
  onClick,
  ...props
}: Omit<ComponentProps<typeof PendingButton>, "pending" | "action"> &
  RunOptions<T> & {
    /** The server action, with its arguments bound. */
    action: () => Promise<T>;
    /**
     * The button's row leaves the page once it has worked (a Delete): focus
     * moves on to the next row rather than dropping to the page.
     */
    removesRow?: boolean;
    /** Where focus goes when that row was the list's last. */
    fallbackFocus?: () => HTMLElement | null | undefined;
  }) {
  const handle = useAction();
  return (
    <PendingButton
      type="button"
      pending={handle.pending}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        const button = event.currentTarget;
        handle.run("action", call, {
          success,
          onError,
          stayPending,
          onSuccess: (result) => {
            if (removesRow) refocusAfterRemoval(button, fallbackFocus);
            onSuccess?.(result);
          },
        });
      }}
      {...props}
    />
  );
}
