"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { resendInviteEmail } from "@/app/actions/invite-requests";
import { Button } from "@/components/ui/button";

/**
 * Sends an already-minted invite link to its recipient again. Shown in the
 * sent-invites history for any live invite — the fix for a failed first send,
 * and for the far more common "I can't find that email".
 */
export function ResendInviteButton({
  id,
  name,
  email,
  failed,
}: {
  id: string;
  name: string;
  email: string;
  /** The first send failed, so this is a retry rather than a duplicate. */
  failed?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function onResend() {
    setBusy(true);
    let res: { ok?: boolean; error?: string };
    try {
      res = await resendInviteEmail(id);
    } catch {
      toast.error("Couldn't reach the server — reload the page and try again.");
      return;
    } finally {
      setBusy(false);
    }
    router.refresh();
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`Invite emailed to ${email}.`);
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={failed ? "default" : "outline"}
      disabled={busy}
      onClick={onResend}
      aria-label={`Email ${name}'s invite link to ${email} again`}
    >
      {busy ? "Sending…" : failed ? "Retry email" : "Resend"}
    </Button>
  );
}
