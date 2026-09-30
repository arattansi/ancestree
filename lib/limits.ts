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

/** A comment on a companion, or on a story (Step 88.4). */
export const COMMENT_MAX = 2000;

/** A story's title, and the story itself (Step 88.3). */
export const STORY_TITLE_MAX = 120;
export const STORY_MAX = 20000;

/**
 * A story's recording, as stored (the `stories` bucket's limit): about an
 * hour and a quarter of speech once the browser has shrunk it.
 */
export const STORY_AUDIO_MAX_MB = 25;

/** An album photo's description, and how many people one may be of
 *  (Step 88.5). */
export const ALBUM_DESCRIPTION_MAX = 500;
export const ALBUM_PEOPLE_MAX = 20;

/**
 * An album photo as stored (Step 88.5): its longest side once the browser
 * has shrunk it, and the `album` bucket's limit, for one it couldn't.
 */
export const ALBUM_PHOTO_EDGE = 1600;
export const ALBUM_PHOTO_MAX_MB = 10;

/** What's wrong, in a report on an entry (Step 88.2). */
export const REPORT_MAX = 1000;

/** The note with a suggested change, and a reason for declining one. */
export const SUGGESTION_NOTE_MAX = 500;

/** A member's display name. */
export const DISPLAY_NAME_MAX = 60;
