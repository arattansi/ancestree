import { revalidatePath } from "next/cache";

/**
 * Refresh every page after a tree write. Tree pages read the tree from a
 * cookie rather than the address, and the header names it on every page,
 * so the whole layout is refreshed rather than a list of routes.
 */
export function revalidateTreePages(): void {
  revalidatePath("/", "layout");
}

/** The account page and the tree pages: writes that touch both. */
export function revalidateTreeAndAccount(): void {
  revalidateTreePages();
}
