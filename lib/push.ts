/**
 * Push notifications to the phone apps (Step 204), as Expo's push service
 * takes them: who wrote, never what (messages are end-to-end encrypted),
 * whom a new story is about, and birthday cards (Step 217.4): one started
 * for someone the member is reminded to sign, their own on the day, and
 * (Step 217.5) the person's thank-you to those who signed.
 * What each opens rides in `data`, read by the phone when it's tapped
 * (`mobile/src/push/`).
 */

/** Expo's push service, which hands each on to Apple or Google. */
export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** The most Expo takes in one request. */
export const PUSH_BATCH = 100;

/** Android's channels, one a kind, each with its own switch in the phone's settings. */
export const PUSH_CHANNELS = {
  messages: "Messages",
  stories: "New stories",
  cards: "Birthday cards",
} as const;

export type PushChannel = keyof typeof PUSH_CHANNELS;

/** What a push opens on the phone. */
export type PushData =
  | { kind: "message"; conversationId: string }
  | { kind: "story"; storyId: string; personId: string }
  /** Whose card; `open` for the person's own, ready to open. */
  | { kind: "card"; personId: string; open: boolean };

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

/**
 * A card started for someone the member is reminded to sign: "Ada’s
 * birthday card", and the notice's own words ("Chidi Okafor started a card
 * for Ada's birthday on 14 November.").
 */
export function cardStartedPush(input: { personId: string; firstName: string; body: string }): PushNote {
  const first = input.firstName.trim();
  return {
    title: first ? `${first}’s birthday card` : "A birthday card",
    body: `${input.body.trim()} Sign it?`,
    data: { kind: "card", personId: input.personId, open: false },
    channelId: "cards",
  };
}

/** Their own card, on the day: "Happy birthday, Ada", and how many signed it. */
export function cardReadyPush(input: { personId: string; firstName: string; signatures: number }): PushNote {
  const first = input.firstName.trim();
  const n = input.signatures;
  return {
    title: first ? `Happy birthday, ${first}` : "Happy birthday",
    body: `Your birthday card is here: ${n} ${n === 1 ? "person" : "people"} signed it.`,
    data: { kind: "card", personId: input.personId, open: true },
    channelId: "cards",
  };
}

/** How much of a thank-you a push shows: the start, whole words. */
const THANKS_IN_PUSH = 140;

/**
 * The person's thank-you, to someone who signed their card: "Ada’s
 * birthday card", "Ada thanked you for signing: “…”". Opens their details,
 * where the card says it whole.
 */
export function cardThanksPush(input: { personId: string; firstName: string; thanks: string }): PushNote {
  const first = input.firstName.trim();
  const words = input.thanks.trim().replace(/\s+/g, " ");
  const cut = words.length > THANKS_IN_PUSH ? words.slice(0, THANKS_IN_PUSH).replace(/\s+\S*$/, "") : words;
  return {
    title: first ? `${first}’s birthday card` : "A birthday card",
    body: `${first || "They"} thanked you for signing: “${cut}${cut.length < words.length ? "…" : ""}”`,
    data: { kind: "card", personId: input.personId, open: false },
    channelId: "cards",
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
