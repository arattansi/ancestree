"use server";

import { deleteAccountOf } from "@/lib/account-deletion.server";
import { findAccounts } from "@/lib/admin-manage.server";
import { getSessionUser } from "@/lib/auth";
import {
  clearCurrentTreeCookie,
  readCurrentTreeId,
} from "@/lib/current-tree.server";
import { removeTreeFilesLater, treeFiles } from "@/lib/file-cleanup.server";
import { revalidateTreePages } from "@/lib/revalidate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isBetaReviewer } from "@/lib/tree-requests.server";

export type AdminManageResult = { error?: string };

const NOT_REVIEWER = "Only a beta reviewer can do that.";

/** A suspension lasts until it's lifted: a hundred years, to Supabase Auth. */
const SUSPENDED_FOR = "876000h";

/**
 * The account a reviewer may act on (Step 103.4): not their own, which the
 * account page deletes, nor another reviewer's. Each action checks the
 * reviewer again.
 */
async function actionableAccount(userId: string): Promise<{ error?: string }> {
  if (!(await isBetaReviewer())) return { error: NOT_REVIEWER };
  const me = await getSessionUser();
  if (!me) return { error: NOT_REVIEWER };
  if (me.id === userId) return { error: "Not your own account." };
  const [account] = await findAccounts(null, userId);
  if (!account) return { error: "That account is gone." };
  if (account.reviewer) return { error: "Not a reviewer's account." };
  return {};
}

/**
 * Reviewer: suspend an account, so it can't sign in or stay signed in
 * (a ban in Supabase Auth, refused at the next sign-in or token refresh),
 * or restore it. Nothing of theirs changes.
 */
export async function setAccountSuspended(
  userId: string,
  suspended: boolean,
): Promise<AdminManageResult> {
  const refused = await actionableAccount(userId);
  if (refused.error) return refused;

  const { error } = await createAdminClient().auth.admin.updateUserById(userId, {
    ban_duration: suspended ? SUSPENDED_FOR : "none",
  });
  if (error) {
    return {
      error: suspended
        ? "Could not suspend the account. Try again."
        : "Could not restore the account. Try again.",
    };
  }
  revalidateTreePages();
  return {};
}

/**
 * Reviewer: delete an account, as its member would from the account page
 * (`deleteAccountOf`): what they added stays with a Root of each tree, and
 * where they're the only Root, `successors` names who takes over.
 */
export async function deleteAccountAsReviewer(
  userId: string,
  successors: Record<string, string>,
): Promise<AdminManageResult> {
  const refused = await actionableAccount(userId);
  if (refused.error) return refused;

  const { error } = await deleteAccountOf(userId, successors, { kind: "reviewer" });
  if (error) return { error };
  revalidateTreePages();
  return {};
}

/**
 * Reviewer: delete any tree, as its Root would (`delete_tree`, which lets a
 * reviewer through): entries whose home it was move to another tree that
 * shows them, the rest go with it, and so do their files (Step 90).
 */
export async function deleteTreeAsReviewer(treeId: string): Promise<AdminManageResult> {
  if (!(await isBetaReviewer())) return { error: NOT_REVIEWER };
  const supabase = await createClient();
  const files = await treeFiles(treeId);
  const { error } = await supabase.rpc("delete_tree", { p_tree: treeId });
  if (error) return { error: "Could not delete the tree. Try again." };
  removeTreeFilesLater(files);
  if ((await readCurrentTreeId()) === treeId) await clearCurrentTreeCookie();
  revalidateTreePages();
  return {};
}
