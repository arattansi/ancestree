"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteMember } from "@/app/actions/members";
import { Button } from "@/components/ui/button";
import { memberRemovedToast, removeMemberConfirm } from "@/lib/remove-member";

/**
 * Removes a member from this tree on the admin console: what they added
 * here becomes yours, and their login is deleted only if it was their only
 * tree (Step 46). Confirmed first, because it can't be undone.
 */
export function DeleteMemberButton({
  treeId,
  treeName,
  userId,
  name,
  entryCount,
  onlyTree,
}: {
  treeId: string;
  treeName: string;
  userId: string;
  name: string;
  entryCount: number;
  /**
   * Whether this is the only tree they're on, so their login goes too; null
   * when the console couldn't tell.
   */
  onlyTree: boolean | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function onDelete() {
    if (
      !window.confirm(
        removeMemberConfirm({ name, treeName, entryCount, onlyTree }),
      )
    ) {
      return;
    }

    setBusy(true);
    let res: { error?: string; lastTree?: boolean };
    try {
      res = await deleteMember(treeId, userId);
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
    toast.success(
      memberRemovedToast({
        name,
        treeName,
        loginDeleted: res.lastTree === true,
      }),
    );
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
