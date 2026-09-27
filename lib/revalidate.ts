import { revalidatePath } from "next/cache";

/**
 * Refresh every page after a tree write. Tree pages read the tree from a
 * cookie rather than the address, and the header names it on every page,
 * so the whole layout is refreshed rather than a list of routes. The
 * action's reply carries the page it was sent from, drawn again, and pages
 * visited earlier are fetched afresh when gone back to. In Next 16.3 any
 * `revalidatePath` does all of this whatever path it names, so one call is
 * enough and a second, narrower one adds nothing (Step 61).
 */
export function revalidateTreePages(): void {
  revalidatePath("/", "layout");
}
