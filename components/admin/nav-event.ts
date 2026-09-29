/**
 * Fired by the admin side nav (and the "Needs attention" card) with a section
 * id in `detail`. {@link AdminGroup} listens for it and opens the group that
 * owns the target section.
 */
export const ADMIN_NAVIGATE_EVENT = "admin:navigate";

/**
 * Open the admin console's section `id` and scroll to it, on the page the
 * console is already on: its group opens itself, then the section comes into
 * view. For a link that would only change the address's `#hash`, which
 * opens nothing (Step 77.3).
 */
export function navigateToAdminSection(id: string): void {
  window.dispatchEvent(new CustomEvent(ADMIN_NAVIGATE_EVENT, { detail: id }));
  requestAnimationFrame(() =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" }),
  );
}
