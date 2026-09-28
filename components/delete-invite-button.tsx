"use client";

import { deleteInviteRequest } from "@/app/actions/invite-requests";
import { ConfirmButton } from "@/components/confirm-dialog";

/**
 * Erases an invite record and any link it minted. Shared by the pending
 * review queue and the sent-invites history — only the wording differs.
 */
export function DeleteInviteButton({
  id,
  name,
  confirm,
  disabled,
  onDeleted,
}: {
  id: string;
  name: string;
  /** The dialog's question, and what the reader must know first, if anything. */
  confirm: { title: string; description?: string };
  disabled?: boolean;
  /** For a row the page keeps on screen itself, which a refresh won't drop. */
  onDeleted?: () => void;
}) {
  return (
    <ConfirmButton
      size="sm"
      variant="destructive"
      disabled={disabled}
      aria-label={`Delete the invite record for ${name}`}
      confirm={{
        ...confirm,
        confirmLabel: "Delete",
        pendingLabel: "Deleting…",
        onConfirm: () => deleteInviteRequest(id),
        onSuccess: () => onDeleted?.(),
      }}
    >
      Delete
    </ConfirmButton>
  );
}
