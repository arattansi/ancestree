"use client";

import { toast } from "sonner";

import { toastError } from "@/components/use-action";

/** What a copy that didn't work says: the reader copies it by hand. */
export const COPY_FAILED = "Couldn't copy — select and copy the link manually";

/**
 * Copy `text` to the clipboard, and say so (Step 77.4, audit R4): `copied`
 * is the toast for it, or `null` where the page already shows it was made.
 * A failure is always said, since the reader has to copy it themselves.
 * Answers whether it was copied.
 */
export async function copyText(
  text: string,
  { copied, failed = COPY_FAILED }: { copied: string | null; failed?: string },
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    if (copied) toast.success(copied);
    return true;
  } catch {
    toastError(failed);
    return false;
  }
}
