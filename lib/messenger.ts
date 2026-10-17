/**
 * The messenger (Step 174): direct messages between members who share a
 * tree, in a pop-up at the bottom right of the window. Tables, rules and
 * the realtime inbox are in `20261016150000_direct_messages`; what's here
 * is what the pop-up keeps and how it reads, unit-tested.
 */

/** Someone the reader can write to: a member of a tree they're on. */
export type MessengerContact = {
  userId: string;
  name: string;
  /** Their own entry, where the reader may see it. */
  personId: string | null;
  photoUrl: string | null;
  photoCrop: unknown;
  /** The trees the two share, by name. */
  trees: string[];
  /** Their key version; null until they next open the messenger. */
  keyVersion: number | null;
};

/** One of the reader's conversations, as the list shows it. */
export type ConversationSummary = {
  id: string;
  otherUserId: string | null;
  name: string;
  personId: string | null;
  photoUrl: string | null;
  photoCrop: unknown;
  /** The other member's key version; null until they open the messenger. */
  otherKeyVersion: number | null;
  /** The last message as it's stored, for the device to read (Step 174.6). */
  last: WireMessage | null;
  /** The last message once read here, and why not if it couldn't be. */
  lastBody: string | null;
  lastStatus?: Unread;
  lastSenderId: string | null;
  lastAt: string | null;
  lastReadAt: string | null;
  unread: number;
  /** Whether they still share a tree, so a message can go. */
  canSend: boolean;
  /**
   * Muted until then (Step 177.4), `"infinity"` until unmuted: left out of
   * the launcher's count and the newsletter's Unread Messages (Step 180).
   * Null when it isn't.
   */
  mutedUntil: string | null;
  /**
   * Who blocked whom (Step 177.3): `by_you` (the reader blocked them) or
   * `by_them`; null when neither has. Either way, nothing more can go.
   */
  blocked: "by_you" | "by_them" | null;
};

/** Someone the reader has blocked (Step 177.3), as Message Security lists them. */
export type BlockedMember = { userId: string; name: string };

/** The longest reason a report takes (`message_reports.reason`). */
export const REPORT_REASON_MAX = 1000;

/** Why a message shows no text: see `decryptMessage`. */
export type Unread = "locked" | "unverified" | "unreadable";

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  /** Empty when it couldn't be read here (`status` says why). */
  body: string;
  createdAt: string;
  /** The version of the sender's key that signed it. */
  senderKeyVersion: number;
  status?: Unread;
  /** Sent from here and not yet confirmed by the database. */
  pending?: boolean;
};

/**
 * A message as the database and Realtime hand it over (Step 174.6):
 * ciphertext, its nonce and signature, and the reader's own sealed key,
 * all base64.
 */
export type WireMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  created_at: string;
  ciphertext: string;
  nonce: string;
  signature: string;
  sender_key_version: number;
  key_version: number | null;
  sealed_key: string | null;
};

/**
 * Who someone is to the reader (Step 177.1), worked out on the server over
 * what the reader can see: `lib/messenger-relation.ts`.
 */
export type MessengerRelation = {
  /** "Your first cousin", "Connected through 3 people". */
  label: string;
  /** Steps between you: New Message lists the closest first. */
  distance: number;
  /** The reader first, the other member last, each named by what they are
   *  to the one before ("your mother Leila"), with their face. */
  chain: {
    personId: string;
    says: string;
    name: string;
    photoUrl: string | null;
    photoCrop: unknown;
  }[];
  /** The connection lit: My Family Tree where it shows them, else the canvas. */
  href: string;
};

/** What `/api/messages` answers. */
export type MessengerData = {
  conversations: ConversationSummary[];
  contacts: MessengerContact[];
  /**
   * Who each member is to the reader, by account (Step 177.1): asked for
   * with `?relations=1` while the pop-up is open, `null` when not asked.
   * Someone missing is joined to the reader by nothing they can see.
   */
  relations: Readonly<Record<string, MessengerRelation>> | null;
};

/** The longest message the database takes. */
export const MESSAGE_MAX = 4000;

/** How many messages a thread reads at a time. */
export const THREAD_PAGE = 50;

/**
 * Where a device link's key waits in the tab's session storage (Step
 * 174.6): put there by `/messages/link`'s first script, read by the page.
 */
export const MESSAGES_LINK_KEPT = "ancestree:messages-link";

/**
 * The query a link opens the messenger with (Step 180, the newsletter's
 * Unread Messages): `?messages=<their user id>` for your conversation with
 * them, a bare `?messages=` for the list.
 */
export const MESSAGES_PARAM = "messages";

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What a page's query asks the messenger to open: nothing (null), the list
 * (`with: null`), or the conversation with a member. Anything after
 * `messages=` that isn't a user id opens the list.
 */
export function messagesLinkTarget(search: string): { with: string | null } | null {
  const params = new URLSearchParams(search);
  if (!params.has(MESSAGES_PARAM)) return null;
  const id = params.get(MESSAGES_PARAM)?.trim() ?? "";
  return { with: USER_ID.test(id) ? id.toLowerCase() : null };
}

/** The same query with the messenger's part taken out, `?` and all when
 *  nothing's left. */
export function withoutMessagesLink(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(MESSAGES_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

/** Each member's own Realtime channel (the migration's policy). */
export function inboxTopic(userId: string): string {
  return `inbox:${userId}`;
}

/** A message as it's stored: no space or blank lines at either end. */
export function trimMessage(body: string): string {
  return body.replace(/^\s+|\s+$/g, "");
}

const isString = (x: unknown): x is string => typeof x === "string";

const isVersion = (x: unknown): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= 1;

/**
 * A message as stored, from a `message` broadcast or a list or thread
 * row, or `null` for anything else.
 */
export function parseWireMessage(payload: unknown): WireMessage | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (
    !isString(p.id) ||
    !isString(p.conversation_id) ||
    !isString(p.sender_id) ||
    !isString(p.created_at) ||
    !isString(p.ciphertext) ||
    !isString(p.nonce) ||
    !isString(p.signature) ||
    !isVersion(p.sender_key_version)
  )
    return null;
  return {
    id: p.id,
    conversation_id: p.conversation_id,
    sender_id: p.sender_id,
    created_at: p.created_at,
    ciphertext: p.ciphertext,
    nonce: p.nonce,
    signature: p.signature,
    sender_key_version: p.sender_key_version,
    key_version: isVersion(p.key_version) ? p.key_version : null,
    sealed_key: isString(p.sealed_key) ? p.sealed_key : null,
  };
}

/** What a message that couldn't be read here says in its place. */
export function unreadText(status: Unread): string {
  if (status === "locked") return "Locked on this device";
  if (status === "unverified") return "This message couldn't be verified";
  return "This message can't be read";
}

/** A `read` broadcast: the reader read a conversation in another tab. */
export function parseReadEvent(
  payload: unknown,
): { conversationId: string; lastReadAt: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (!isString(p.conversation_id) || !isString(p.last_read_at)) return null;
  return { conversationId: p.conversation_id, lastReadAt: p.last_read_at };
}

/** A timestamp in milliseconds; Postgres's `infinity` is forever. */
const time = (iso: string | null | undefined) =>
  !iso ? -Infinity : iso === "infinity" ? Infinity : new Date(iso).getTime();

/**
 * Two runs of a thread as one, oldest first, each message once. A message
 * confirmed by the database takes the place of the pending one it was.
 */
export function mergeMessages(
  a: readonly ChatMessage[],
  b: readonly ChatMessage[],
): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of [...a, ...b]) {
    const had = byId.get(m.id);
    if (!had || (had.pending && !m.pending)) byId.set(m.id, m);
  }
  return [...byId.values()].sort(
    (x, y) => time(x.createdAt) - time(y.createdAt) || x.id.localeCompare(y.id),
  );
}

/**
 * The list once a message has arrived: its conversation first, with the
 * message as its last; one more unread unless it's the reader's own or the
 * conversation is open in front of them. `null` when the list doesn't have
 * the conversation yet (someone's first message): read the list again.
 */
export function withIncoming(
  list: readonly ConversationSummary[],
  message: ChatMessage,
  me: string,
  openId: string | null,
): ConversationSummary[] | null {
  const had = list.find((c) => c.id === message.conversationId);
  if (!had) return null;
  if (time(had.lastAt) > time(message.createdAt)) return [...list];
  const mine = message.senderId === me;
  const seen = mine || openId === message.conversationId;
  const next: ConversationSummary = {
    ...had,
    lastBody: message.body,
    lastStatus: message.status,
    lastSenderId: message.senderId,
    lastAt: message.createdAt,
    unread: seen ? had.unread : had.unread + 1,
    lastReadAt: mine ? message.createdAt : had.lastReadAt,
  };
  return [next, ...list.filter((c) => c.id !== message.conversationId)];
}

/** The list once a conversation has been read up to `lastReadAt`. */
export function withRead(
  list: readonly ConversationSummary[],
  conversationId: string,
  lastReadAt: string,
): ConversationSummary[] {
  return list.map((c) =>
    c.id === conversationId && time(lastReadAt) > time(c.lastReadAt)
      ? {
          ...c,
          lastReadAt,
          unread: time(lastReadAt) >= time(c.lastAt) ? 0 : c.unread,
        }
      : c,
  );
}

/** What the launcher's badge says: muted conversations aren't counted. */
export function totalUnread(
  list: readonly ConversationSummary[],
  now: number = Date.now(),
): number {
  return list.reduce((sum, c) => sum + (isMuted(c, now) ? 0 : c.unread), 0);
}

/** Whether a conversation is muted at `now` (Step 177.4). */
export function isMuted(
  c: Pick<ConversationSummary, "mutedUntil">,
  now: number = Date.now(),
): boolean {
  return time(c.mutedUntil) > now;
}

/** How long a conversation can be muted for: hours, or until unmuted.
 *  Each is a button's words, so lower-case (Step 102). */
export const MUTE_CHOICES = [
  { label: "for 8 hours", hours: 8 },
  { label: "for a week", hours: 24 * 7 },
  { label: "always", hours: null },
] as const;

/** When a mute of `hours` ends, as the database takes it. */
export function muteUntil(hours: number | null, now: Date = new Date()): string {
  return hours == null
    ? "infinity"
    : new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
}

/** What a muted conversation says of it: "Muted until 6:40 PM", "Muted". */
export function mutedText(mutedUntil: string, now: Date = new Date()): string {
  if (mutedUntil === "infinity") return "Muted";
  const days = -daysAgo(mutedUntil, now);
  const at = new Date(mutedUntil);
  if (days <= 0) return `Muted until ${CLOCK.format(at)}`;
  if (days === 1) return `Muted until tomorrow, ${CLOCK.format(at)}`;
  return `Muted until ${DAY_MONTH.format(at)}`;
}

/** A `muted` broadcast: the reader muted a conversation in another tab. */
export function parseMutedEvent(
  payload: unknown,
): { conversationId: string; mutedUntil: string | null } | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (!isString(p.conversation_id)) return null;
  if (p.muted_until !== null && !isString(p.muted_until)) return null;
  return { conversationId: p.conversation_id, mutedUntil: p.muted_until };
}

/** The list once a conversation is muted until `mutedUntil`, or unmuted. */
export function withMuted(
  list: readonly ConversationSummary[],
  conversationId: string,
  mutedUntil: string | null,
): ConversationSummary[] {
  return list.map((c) => (c.id === conversationId ? { ...c, mutedUntil } : c));
}

/** A `deleted` broadcast: its sender deleted a message (Step 177.5). */
export function parseDeletedEvent(
  payload: unknown,
): { id: string; conversationId: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (!isString(p.id) || !isString(p.conversation_id)) return null;
  return { id: p.id, conversationId: p.conversation_id };
}

/**
 * A thread once its newest page has been read again: the page, and of what
 * it had, only what the page doesn't cover (older messages, ones that came
 * since, and sends not yet confirmed). A message deleted on another device
 * drops out. `full` when the page was a whole one, so older ones are left
 * where they were.
 */
export function withNewestPage(
  had: readonly ChatMessage[],
  page: readonly ChatMessage[],
  full: boolean,
): ChatMessage[] {
  const times = page.map((m) => time(m.createdAt));
  const newest = times.length ? Math.max(...times) : Infinity;
  const oldest = full && times.length ? Math.min(...times) : -Infinity;
  const kept = had.filter((m) => {
    if (m.pending) return true;
    const t = time(m.createdAt);
    return full ? t <= oldest || t > newest : t > newest;
  });
  return mergeMessages(kept, page);
}

/** Up to two letters for a face without a photo. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words.at(-1)!] : words;
  return letters.map((w) => [...w][0]?.toLocaleUpperCase() ?? "").join("") || "?";
}

/** A badge's number: 1 to 9, then "9+". */
export function badgeCount(n: number): string {
  return n > 9 ? "9+" : String(n);
}

/** Contacts whose name, or a tree they share, has every word typed. */
export function filterContacts(
  contacts: readonly MessengerContact[],
  query: string,
): MessengerContact[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...contacts];
  return contacts.filter((c) => {
    const hay = [c.name, ...c.trees].join(" ").toLocaleLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** How many calendar days `iso` is before `now`, in the reader's time zone. */
function daysAgo(iso: string, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY_MS);
}

const CLOCK = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const LONG_WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long" });
const DAY_MONTH = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** When a message came, as the list shows it: "2:41 PM", "Yesterday", "Mon", "Oct 12". */
export function shortWhen(iso: string, now: Date = new Date()): string {
  const days = daysAgo(iso, now);
  const at = new Date(iso);
  if (days <= 0) return CLOCK.format(at);
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAY.format(at);
  if (at.getFullYear() === now.getFullYear()) return DAY_MONTH.format(at);
  return DAY_MONTH_YEAR.format(at);
}

/** The line between days in a thread: "Today", "Yesterday", "Monday", "Oct 12". */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const days = daysAgo(iso, now);
  const at = new Date(iso);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return LONG_WEEKDAY.format(at);
  if (at.getFullYear() === now.getFullYear()) return DAY_MONTH.format(at);
  return DAY_MONTH_YEAR.format(at);
}

/** The clock time a bubble shows on hover. */
export function clockTime(iso: string): string {
  return CLOCK.format(new Date(iso));
}

/** Whether two messages fall on different days, in the reader's time zone. */
export function newDay(prev: string | undefined, next: string): boolean {
  if (!prev) return true;
  return startOfDay(new Date(prev)) !== startOfDay(new Date(next));
}

/** What a refusal from the database says to the reader. */
export function sendErrorText(message: string | undefined): string {
  if (message?.includes("BLOCKED")) return "You can't message them.";
  if (message?.includes("NO_SHARED_TREE")) return "You no longer share a tree.";
  if (message?.includes("NO_KEY")) return "They can get messages once they next visit ancestree.";
  if (message?.includes("LOCKED")) return "Messages are locked on this device.";
  if (message?.includes("CODE_CHANGED")) return "Their security code changed. Verify it to keep writing.";
  if (message?.includes("UNTRUSTED")) return "Couldn't check their security code, so it wasn't sent.";
  if (message?.includes("SLOW_DOWN")) return "Slow down, then try again.";
  if (message?.includes("MESSAGE_TOO_LONG"))
    return `Keep it under ${MESSAGE_MAX.toLocaleString("en")} characters.`;
  return "Couldn't send. Try again.";
}

/** A conversation as the export writes it out (Step 177.6). */
export type ExportedConversation = {
  name: string;
  messages: readonly ChatMessage[];
};

const FULL_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

/**
 * The reader's conversations as a plain text file (Step 177.6), read on
 * their own device: the server holds only ciphertext, so its exports can't
 * have them. Each conversation under its name, days marked, each message
 * with its time and who wrote it; a message that couldn't be read here
 * says why.
 */
export function exportText(
  conversations: readonly ExportedConversation[],
  me: string,
  now: Date = new Date(),
): string {
  const lines = [
    "Your ancestree messages",
    `Read on this device on ${DAY_MONTH_YEAR.format(now)}. Only the people in each conversation can read them: keep this file somewhere safe.`,
  ];
  for (const c of conversations) {
    lines.push("", "", `== ${c.name} ==`);
    if (c.messages.length === 0) lines.push("", "No messages.");
    let prev: string | undefined;
    for (const m of c.messages) {
      if (newDay(prev, m.createdAt)) lines.push("", FULL_DATE.format(new Date(m.createdAt)));
      prev = m.createdAt;
      const who = m.senderId === me ? "You" : c.name;
      const lead = `${CLOCK.format(new Date(m.createdAt))}  ${who}: `;
      const text = m.status ? `[${unreadText(m.status)}]` : m.body;
      const [first = "", ...rest] = text.split("\n");
      lines.push(lead + first, ...rest.map((line) => " ".repeat(lead.length) + line));
    }
  }
  return `${lines.join("\n")}\n`;
}

/** The export's file name: "ancestree-messages-2026-10-16.txt". */
export function exportFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `ancestree-messages-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.txt`;
}

/** What a refused report says (Step 177.3). */
export function reportErrorText(message: string | undefined): string {
  if (message?.includes("ALREADY_REPORTED")) return "You've already reported this message.";
  if (message?.includes("NO_MESSAGE")) return "That message is gone.";
  if (message?.includes("SLOW_DOWN")) return "You've reported a lot today. Try again tomorrow.";
  if (message?.includes("TOO_LONG")) return `Keep the reason under ${REPORT_REASON_MAX.toLocaleString("en")} characters.`;
  return "Couldn't send the report. Try again.";
}

/** Whether a broadcast's `blocks` event names a change (Step 177.3). */
export function parseBlocksEvent(payload: unknown): { userId: string; blocked: boolean } | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (!isString(p.user_id) || typeof p.blocked !== "boolean") return null;
  return { userId: p.user_id, blocked: p.blocked };
}
