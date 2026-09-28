"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

import { PendingButton } from "@/components/pending-button";

/**
 * A submit button that shows its form's action running (spinner,
 * `pendingLabel`, `aria-busy`) and stays disabled until the action's result,
 * or the page it redirects to, has arrived.
 */
export function SubmitButton(
  props: Omit<ComponentProps<typeof PendingButton>, "pending" | "type">,
) {
  const { pending } = useFormStatus();
  return <PendingButton type="submit" pending={pending} {...props} />;
}
