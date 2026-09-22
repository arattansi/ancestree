import { revalidatePath } from "next/cache";

/**
 * Refresh every tree-scoped page after a write (Step 25). Tree pages live
 * under a dynamic segment, so the route patterns are named here once; a
 * server action calls this instead of listing paths. Revalidating the tree
 * layout covers the canvas, review, admin, add and edit pages beneath it.
 */
export function revalidateTreePages(): void {
  revalidatePath("/t/[slug]", "layout");
}

/** The account page and the tree pages: writes that touch both. */
export function revalidateTreeAndAccount(): void {
  revalidateTreePages();
  revalidatePath("/account");
  revalidatePath("/trees");
}
