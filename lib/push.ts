/**
 * Push notifications to the phone apps (Step 204), as Expo's push service
 * takes them: who wrote, never what (messages are end-to-end encrypted),
 * and whom a new story is about. What each opens rides in `data`, read by
 * the phone when it's tapped (`mobile/src/push/`).
 */

/** Expo's push service, which hands each on to Apple or Google. */
export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** The most Expo takes in one request. */
export const PUSH_BATCH = 100;

/** Android's channels, one a kind, each with its own switch in the phone's settings. */
export const PUSH_CHANNELS = {
  messages: "Messages",
  stories: "New stories",
} as const;

export type PushChannel = keyof typeof PUSH_CHANNELS;

/** What a push opens on the phone. */
export type PushData =
  | { kind: "message"; conversationId: string }
  | { kind: "story"; storyId: string; personId: string };

/** One push, before it's addressed to a phone. */
export type PushNote = {
  title: string;
  body?: string;
  data: PushData;
  channelId: PushChannel;
  /** iOS groups a conversation's pushes together. */
  threadId?: string;
};

/** A push addressed to one phone's Expo token. */
export type ExpoPush = PushNote & { to: string; sound: "default" };

/** "Amina Khan", "New message". */
export function messagePush(input: { senderName: string; conversationId: string }): PushNote {
  return {
    title: input.senderName.trim() || "A relative",
    body: "New message",
    data: { kind: "message", conversationId: input.conversationId },
    channelId: "messages",
    threadId: input.conversationId,
  };
}

/** "New story about Amina Khan", and its title when it has one. */
export function storyPush(input: {
  storyId: string;
  personId: string;
  title: string | null;
  about: string | null;
}): PushNote {
  const about = input.about?.trim();
  const title = input.title?.trim();
  return {
    title: about ? `New story about ${about}` : "New story",
    ...(title ? { body: `“${title}”` } : {}),
    data: { kind: "story", storyId: input.storyId, personId: input.personId },
    channelId: "stories",
  };
}

/** Each member's push, once to every phone they're signed in on. */
export function addressPushes(
  notes: ReadonlyArray<{ userId: string; note: PushNote }>,
  tokens: ReadonlyArray<{ user_id: string; token: string }>,
): ExpoPush[] {
  const phones = new Map<string, string[]>();
  for (const t of tokens) phones.set(t.user_id, [...(phones.get(t.user_id) ?? []), t.token]);
  return notes.flatMap(({ userId, note }) =>
    (phones.get(userId) ?? []).map((to) => ({ ...note, to, sound: "default" as const })),
  );
}

/** Split into requests Expo takes. */
export function pushBatches<T>(items: readonly T[], size = PUSH_BATCH): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

/**
 * The phones Expo says the app is gone from (uninstalled, or its
 * permission taken back), from the tickets it answers a request with, one
 * ticket a push in the order sent.
 */
export function goneTokens(sent: readonly ExpoPush[], response: unknown): string[] {
  const tickets = (response as { data?: unknown } | null)?.data;
  if (!Array.isArray(tickets)) return [];
  return tickets.flatMap((ticket, i) => {
    const t = ticket as { status?: string; details?: { error?: string } } | null;
    const to = sent[i]?.to;
    return t?.status === "error" && t.details?.error === "DeviceNotRegistered" && to ? [to] : [];
  });
}
