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
};

/** One of the reader's conversations, as the list shows it. */
export type ConversationSummary = {
  id: string;
  otherUserId: string | null;
  name: string;
  personId: string | null;
  photoUrl: string | null;
  photoCrop: unknown;
  lastBody: string | null;
  lastSenderId: string | null;
  lastAt: string | null;
  lastReadAt: string | null;
  unread: number;
  /** Whether they still share a tree, so a message can go. */
  canSend: boolean;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  /** Sent from here and not yet confirmed by the database. */
  pending?: boolean;
};

/** What `/api/messages` answers. */
export type MessengerData = {
  conversations: ConversationSummary[];
  contacts: MessengerContact[];
};

/** The longest message the database takes. */
export const MESSAGE_MAX = 4000;

/** How many messages a thread reads at a time. */
export const THREAD_PAGE = 50;

/**
 * The pages the pop-up sits on: a member's own (the canvas, My Family Tree,
 * the account and admin pages, their trees), not the marketing pages, the
 * library, sign-in or a form, which keep the corner to themselves.
 */
const MESSENGER_PAGES = ["/tree", "/family", "/account", "/admin", "/trees"];

export function messengerShownOn(pathname: string | null): boolean {
  if (!pathname) return false;
  return MESSENGER_PAGES.some(
    (page) => pathname === page || pathname.startsWith(`${page}/`),
  );
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

/** A `message` broadcast from the inbox, or `null` for anything else. */
export function parseInboxMessage(payload: unknown): ChatMessage | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (
    !isString(p.id) ||
    !isString(p.conversation_id) ||
    !isString(p.sender_id) ||
    !isString(p.body) ||
    !isString(p.created_at)
  )
    return null;
  return {
    id: p.id,
    conversationId: p.conversation_id,
    senderId: p.sender_id,
    body: p.body,
    createdAt: p.created_at,
  };
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

const time = (iso: string | null | undefined) =>
  iso ? new Date(iso).getTime() : -Infinity;

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

/** What the launcher's badge says. */
export function totalUnread(list: readonly ConversationSummary[]): number {
  return list.reduce((sum, c) => sum + c.unread, 0);
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
  if (message?.includes("NO_SHARED_TREE")) return "You no longer share a tree.";
  if (message?.includes("SLOW_DOWN")) return "Slow down, then try again.";
  if (message?.includes("MESSAGE_TOO_LONG"))
    return `Keep it under ${MESSAGE_MAX.toLocaleString("en")} characters.`;
  return "Couldn't send. Try again.";
}
