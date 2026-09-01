/**
 * Fired by the admin side nav (and the "Needs attention" card) with a section
 * id in `detail`. {@link AdminGroup} listens for it and opens the group that
 * owns the target section.
 */
export const ADMIN_NAVIGATE_EVENT = "admin:navigate";
