"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/** A submit button that disables itself while its form's action is running. */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
