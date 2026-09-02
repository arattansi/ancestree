"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteMember } from "@/app/actions/members";
import { Button } from "@/components/ui/button";

/**
 * Removes a member on /admin: reassigns their entries to you and deletes their
 * login. Double-confirmed because it can't be undone.
 */
export function DeleteMemberButton({
  userId,
  name,
  entryCount,
}: {
  userId: string;
  name: string;
  entryCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function onDelete() {
    const entries =
      entryCount > 0
        ? ` Their ${entryCount} entr${entryCount === 1 ? "y" : "ies"} and anything else they added become yours.`
        : "";
    if (
      !window.confirm(
        `Remove ${name}? Their login is deleted and they can't return without a new invite.${entries} This cannot be undone.`,
      )
    ) {
      return;
    }

    setBusy(true);
    let res: { error?: string };
    try {
      res = await deleteMember(userId);
    } catch {
      toast.error("Couldn't reach the server — reload the page and try again.");
      setBusy(false);
      return;
    }
    setBusy(false);
    router.refresh();
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`${name} removed.`);
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="destructive"
      disabled={busy}
      onClick={onDelete}
      aria-label={`Remove ${name}`}
    >
      {busy ? "Removing…" : "Remove"}
    </Button>
  );
}
