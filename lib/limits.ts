/**
 * Limits the browser and the server both hold to (Step 77.4, audit R4): one
 * number each, so a form's box, its check, the action's refusal and the
 * words that name it never drift apart.
 */

/**
 * How long an emailed invite's link works. The database counts one as live
 * only while `expires_at > now()` (`lib/expiry.ts`).
 */
export const INVITE_LIFETIME_DAYS = 14;

/** How long a share link works when it's set to expire. */
export const SHARE_LINK_DAYS = 30;

/** A tree's name. The database only needs it not to be blank. */
export const TREE_NAME_MAX = 80;

/** A share link's label. */
export const SHARE_LINK_LABEL_MAX = 80;

/** A comment on an entry or a companion. */
export const COMMENT_MAX = 2000;

/** The note with a suggested change, and a reason for declining one. */
export const SUGGESTION_NOTE_MAX = 500;

/** A member's display name. */
export const DISPLAY_NAME_MAX = 60;
