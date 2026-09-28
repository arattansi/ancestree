"use client";

import type { ComponentProps } from "react";
import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * A button that shows its own call running (Step 70): a spinner and
 * `pendingLabel` in place of its label, `aria-busy`, and disabled until the
 * call's result has arrived. Pair it with `useAction`: `pending` for this
 * button's key, `disabled` while the handle's other calls run.
 */
export function PendingButton({
  pending = false,
  pendingLabel,
  disabled,
  children,
  size,
  "aria-label": ariaLabel,
  ...props
}: ComponentProps<typeof Button> & {
  pending?: boolean;
  pendingLabel?: string;
}) {
  const iconOnly = typeof size === "string" && size.startsWith("icon");
  const spinner = (
    <Loader2Icon
      className="animate-spin"
      data-icon={iconOnly ? undefined : "inline-start"}
      aria-hidden
    />
  );
  return (
    <Button
      size={size}
      disabled={pending || disabled}
      // Busy, it keeps focus, so a keyboard user isn't dropped to the page's
      // start while it runs (Step 70, audit B7).
      focusableWhenDisabled={pending}
      aria-busy={pending || undefined}
      data-pending={pending ? "" : undefined}
      // A fixed label would hide "Deleting…" from a screen reader.
      aria-label={pending && pendingLabel ? pendingLabel : ariaLabel}
      {...props}
    >
      {!pending ? (
        children
      ) : iconOnly ? (
        spinner
      ) : (
        <>
          {spinner}
          {pendingLabel ?? children}
        </>
      )}
    </Button>
  );
}
