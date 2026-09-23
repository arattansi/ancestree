/**
 * Invites to claim an entry (Step 38): the ones sent from its card, from the
 * add-relative form's email box, or by approving a request as that entry.
 * Each keeps a "Sent invites" record for the Roots, named after the entry
 * (`claimInviteRecordName`), and the entry's card says who sent one and when
 * (`claimInvitesShown`, `describeClaimInvite`), so nobody sends a second
 * without knowing about the first. Pure; `claim-invites.server.ts` loads them.
 */

import type { NamedPerson } from "@/lib/person-name";

/**
 * The name a claim invite's "Sent invites" record carries: the entry's, as
 * its card shows it (preferred name, else first name, then last name, as
 * `private.person_label` has it). An entry always has both halves, so the
 * record's non-empty checks hold.
 */
export function claimInviteRecordName(person: NamedPerson): {
  first_name: string;
  last_name: string;
} {
  return {
    first_name: person.preferred_name?.trim() || person.first_name?.trim() || "",
    last_name: person.last_name?.trim() ?? "",
  };
}

/** One live-or-lapsed invite naming an entry, as the server reads it. */
export type ClaimInviteRow = {
  id: string;
  personId: string;
  /** `invites.created_by`: whoever sent it, or the Root who approved it. */
  sentBy: string;
  /** Their display name; null when they have none. */
  sentByName: string | null;
  /** Who it went to. */
  email: string | null;
  sentAt: string;
  expiresAt: string | null;
  archived: boolean;
  /** From its "Sent invites" record; null when that isn't known. */
  emailSent: boolean | null;
};

/** Who is looking at the card. */
export type ClaimInviteViewer = { userId: string; isRoot: boolean };

/** What an entry's card says about one invite. */
export type EntryInvite = {
  id: string;
  personId: string;
  /** Null when the sender has no display name. */
  sentByName: string | null;
  /** The viewer sent it: the card says "you". */
  sentByViewer: boolean;
  sentAt: string;
  expiresAt: string | null;
  /** Still usable: not archived, not expired. */
  live: boolean;
  /** Its email is known not to have gone out. */
  emailFailed: boolean;
  /** The address, for a Root or the sender; null for anyone else. */
  email: string | null;
};

function isLive(row: ClaimInviteRow, now: Date): boolean {
  if (row.archived) return false;
  if (!row.expiresAt) return true;
  return Date.parse(row.expiresAt) > now.getTime();
}

/**
 * Which invites each entry's card lists, newest first: every one still
 * live — or, when none is, the latest that lapsed, so the card says it ran
 * out rather than going quiet. Every member sees who sent it and when; the
 * address only reaches a Root, who sees it in the admin console anyway, and
 * whoever sent it.
 */
export function claimInvitesShown(
  rows: readonly ClaimInviteRow[],
  viewer: ClaimInviteViewer,
  now: Date,
): EntryInvite[] {
  const byPerson = new Map<string, ClaimInviteRow[]>();
  for (const row of rows) {
    const list = byPerson.get(row.personId);
    if (list) list.push(row);
    else byPerson.set(row.personId, [row]);
  }

  const shown: EntryInvite[] = [];
  for (const list of byPerson.values()) {
    const newestFirst = [...list].sort(
      (a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt),
    );
    const live = newestFirst.filter((row) => isLive(row, now));
    for (const row of live.length > 0 ? live : newestFirst.slice(0, 1)) {
      const sentByViewer = row.sentBy === viewer.userId;
      shown.push({
        id: row.id,
        personId: row.personId,
        sentByName: row.sentByName,
        sentByViewer,
        sentAt: row.sentAt,
        expiresAt: row.expiresAt,
        live: isLive(row, now),
        emailFailed: row.emailSent === false,
        email: viewer.isRoot || sentByViewer ? row.email : null,
      });
    }
  }
  return shown;
}

/**
 * The card's line for one invite, e.g. "Aalim Rattansi sent an invite on
 * 23 Sep 2026. The link works until 7 Oct 2026." `formatDate` renders a
 * date the way the card does.
 */
export function describeClaimInvite(
  invite: EntryInvite,
  formatDate: (iso: string) => string,
): string {
  const who = invite.sentByViewer ? "you" : (invite.sentByName ?? "a member");
  const Who = who === "you" || who === "a member" ? capitalise(who) : who;
  const on = formatDate(invite.sentAt);
  const to = invite.email ? ` to ${invite.email}` : "";

  if (!invite.live) {
    return `The invite ${who} sent on ${on}${to} expired unused.`;
  }
  if (invite.emailFailed) {
    return `${Who} made an invite on ${on}${to}, but the email didn’t send.`;
  }
  return invite.expiresAt
    ? `${Who} sent an invite on ${on}${to}. The link works until ${formatDate(invite.expiresAt)}.`
    : `${Who} sent an invite on ${on}${to}. It hasn’t been accepted yet.`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
