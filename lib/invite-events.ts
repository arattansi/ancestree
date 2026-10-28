/**
 * What happens to invites (Step 216): made, shared, opened, a code sent,
 * joined, an email added later. `private.invite_events` keeps them, by
 * invite, so the analytics tab can tell a link never shared from one shared
 * and never opened, or opened and given up on. The words for each live here,
 * shared by what records them and what shows them.
 */

/** A share button an invite went out through (`note_invite_shared`). */
export const SHARE_CHANNELS = ["share", "whatsapp", "messages", "copy"] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

/**
 * How someone came in on an invite (`redeem_invite_tree`'s `p_path`): their
 * name alone (Step 213), a code emailed to them, an emailed invite's one
 * button, or signed in already.
 */
export const JOIN_PATHS = ["name", "email_code", "emailed_invite", "signed_in"] as const;
export type JoinPath = (typeof JOIN_PATHS)[number];

/**
 * The cookie holding a visitor's random id, so an invite opened twice in a
 * day by one person counts once. Only the route that notes opens is sent it
 * (`OPENED_PATH`), and the database keeps only a hash of it with the invite
 * and the day.
 */
export const VISITOR_COOKIE = "ancestree-visitor";

/** A visitor stays one for a year, renewed by no visit. */
export const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;

/** Where the invite page says it was opened. */
export const OPENED_PATH = "/api/invite-opened";

/** A visitor id we made: a UUID, as `crypto.randomUUID()` gives. */
export function isVisitorId(value: string | undefined): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  );
}

/** An invite's token, as `/join/<token>` carries it: hex, never long. */
export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{16,200}$/.test(value);
}
