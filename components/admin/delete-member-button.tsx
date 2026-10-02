"use client";

import { deleteMember } from "@/app/actions/members";
import { ConfirmButton } from "@/components/confirm-dialog";
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
  return (
    <ConfirmButton
      size="sm"
      variant="destructive"
      aria-label={`Remove ${name}`}
      confirm={{
        ...removeMemberConfirm({ name, treeName, entryCount, onlyTree }),
        confirmLabel: "remove",
        pendingLabel: "removing…",
        onConfirm: () => deleteMember(treeId, userId),
        // Whether their login went, as the removal found it: nothing on the
        // page says so.
        success: (res) =>
          memberRemovedToast({
            name,
            treeName,
            loginDeleted: res.lastTree === true,
          }),
      }}
    >
      remove
    </ConfirmButton>
  );
}
