"use client";

import { toast } from "sonner";

import { copyText } from "@/components/copy-text";

// Driven by a finger: a phone or a tablet, whose share sheet is how links
// go anywhere. A desktop's sheet (Safari, Edge) is a detour; the clipboard
// is what's wanted there.
const TOUCH = "(pointer: coarse)";

function hasShareSheet(): boolean {
  return (
    typeof navigator.share === "function" && window.matchMedia(TOUCH).matches
  );
}

const COPIED = "Link copied";

/**
 * Send a link (Step 88.4): the share sheet on a phone or tablet, else
 * copied. A browser only allows either while the press that asked is
 * fresh, and a link made first by the server can take long enough to go
 * stale; then a toast holds it, and pressing its button sends it.
 */
export async function sendLink(url: string, title?: string): Promise<void> {
  if (hasShareSheet()) {
    const data: ShareData = title ? { title, url } : { url };
    try {
      await navigator.share(data);
    } catch (thrown) {
      // Closing the sheet without sharing rejects; that's no error.
      if (thrown instanceof DOMException && thrown.name === "AbortError") return;
      toast("Link ready", {
        action: {
          label: "Share",
          onClick: () => void navigator.share(data).catch(() => {}),
        },
      });
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    toast.success(COPIED);
  } catch {
    toast("Link ready", {
      action: { label: "Copy", onClick: () => void copyText(url, { copied: COPIED }) },
    });
  }
}
