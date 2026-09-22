"use server";

import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth";
import { setCurrentTreeCookie } from "@/lib/current-tree.server";
import { revalidateTreePages } from "@/lib/revalidate";
import { safeNext } from "@/lib/sign-in.server";
import { getTreeById } from "@/lib/tree-context";
import { treeHref, treesHref } from "@/lib/tree-links";

async function remember(treeId: string): Promise<boolean> {
  await requireProfile();
  // RLS on `trees` only returns a row to a member or a visitor.
  const tree = await getTreeById(treeId);
  if (!tree) return false;
  await setCurrentTreeCookie(tree.id);
  revalidateTreePages();
  return true;
}

/**
 * Look at another tree: the header's switcher. Remembers the tree in the
 * browser and opens its canvas. Works for any tree the member can see —
 * their own, or one opened to them as a visitor.
 */
export async function switchTree(treeId: string): Promise<{ error?: string }> {
  if (!(await remember(treeId))) return { error: "You can't open that tree." };
  redirect(treeHref());
}

/**
 * The same, as a form action bound to a tree and a destination — a
 * notification's "View on tree", an "Also on" link, the trees list. The
 * form's FormData arrives as a third argument and is ignored. A tree they
 * can no longer see lands them on their trees page instead.
 */
export async function switchTreeForm(
  treeId: string,
  next: string,
): Promise<void> {
  const ok = await remember(treeId);
  redirect(ok ? safeNext(next) : treesHref());
}
