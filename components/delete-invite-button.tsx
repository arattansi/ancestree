"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteInviteRequest } from "@/app/actions/invite-requests";
import { Button } from "@/components/ui/button";

/**
 * Erases an invite record and any link it minted. Shared by the pending
 * review queue and the sent-invites history — only the wording differs.
 */
export function DeleteInviteButton({
  id,
  name,
  confirmText,
  disabled,
}: {
  id: string;
  name: string;
  confirmText: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function onDelete() {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    const res = await deleteInviteRequest(id);
    setBusy(false);
    router.refresh();
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Deleted.");
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="destructive"
      disabled={busy || disabled}
      onClick={onDelete}
      aria-label={`Delete the invite record for ${name}`}
    >
      {busy ? "Deleting…" : "Delete"}
    </Button>
  );
}
