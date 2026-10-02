"use client";

import { resendInviteEmail } from "@/app/actions/invite-requests";
import { ActionButton } from "@/components/action-button";

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
  return (
    <ActionButton
      size="sm"
      variant={failed ? "default" : "outline"}
      action={() => resendInviteEmail(id)}
      success={`Invite emailed to ${email}.`}
      pendingLabel="sending…"
      aria-label={`Email ${name}'s invite link to ${email} again`}
    >
      {failed ? "retry email" : "resend"}
    </ActionButton>
  );
}
