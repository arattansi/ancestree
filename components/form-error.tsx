import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Why a form or dialog's save didn't work, by its button (Step 70, audit
 * B5): where the reader is looking, and it stays until they try again,
 * where a toast would fade in a few seconds. Renders nothing without an
 * error; `role="alert"` has it read out when it appears.
 */
export function FormError({
  children,
  id,
  className,
}: {
  children?: ReactNode;
  id?: string;
  className?: string;
}) {
  if (!children) return null;
  return (
    <p
      id={id}
      role="alert"
      className={cn("text-sm font-medium text-destructive", className)}
    >
      {children}
    </p>
  );
}
