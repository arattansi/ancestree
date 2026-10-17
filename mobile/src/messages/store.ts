import type { RealtimeChannel } from "@supabase/supabase-js";
import { randomUUID } from "expo-crypto";
import * as React from "react";
import { AppState } from "react-native";

import {
  backupKeyFromPhrase,
  currentVersion,
  decryptMessage,
  encryptMessage,
  fromBase64,
  fromBase64Url,
  keyId,
  matchesPublished,
  newKeyPair,
  newLinkKey,
  newRecoveryPhrase,
  safetyCode,
  toBase64,
  toBase64Url,
  unwrapKeyring,
  wrapKeyring,
  type KeyPair,
  type Keyring,
  type PublicKey,
  type Recipient,
} from "@/lib/e2e/crypto";
import { checkPin, type Pins } from "@/lib/e2e/pins";
import {
  exportFilename,
  exportText,
  inboxTopic,
  mergeMessages,
  muteUntil,
  parseBlocksEvent,
  parseDeletedEvent,
  parseMutedEvent,
  parseReadEvent,
  parseWireMessage,
  reportErrorText,
  sendErrorText,
  THREAD_PAGE,
  totalUnread,
  trimMessage,
  withIncoming,
  withMuted,
  withNewestPage,
  withRead,
  type BlockedMember,
  type ChatMessage,
  type ExportedConversation,
  type MessengerData,
  type WireMessage,
} from "@/lib/messenger";
import { supabase } from "@/auth/supabase";
import {
  loadKeyring,
  loadPendingKey,
  loadPins,
  loadVerified,
  saveKeyring,
  savePendingKey,
  savePins,
  saveVerified,
  withKeyLock,
} from "@/messages/keystore";
import { loadMessenger } from "@/messages/load";

/*
 * The phone's messenger (Step 179.1): the web's (`components/messenger/
 * messenger-store.ts`, Steps 174, 174.6 and 177) step for step, kept
 * outside React so the leaf's badge, the person sheet's **message** and the
 * messages screens share it. It wakes once a member is signed in, reads the
 * list straight from the database and joins the member's own inbox, the
 * private Realtime channel every new message of theirs is sent to, so the
 * badge and an open conversation keep up without asking.
 *
 * Messages arrive as ciphertext and are read here, with the member's
 * messaging key from the phone's Keychain. The member has one key; the
 * first device to open messages makes it, and the phone, when it isn't
 * that device, is locked until it's linked from one that is (its QR code
 * or link) or the recovery phrase opens it.
 */

const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? "https://www.ancestree.space";

export type Thread = {
  messages: ChatMessage[];
  /** Older messages wait to be read. */
  more: boolean;
  loading: boolean;
  failed: boolean;
};

/**
 * This phone's keys: `waiting` while they're looked for, `ready` to read
 * and send, `locked` when the member's key lives on another device (or
 * changed there), `unavailable` when the Keychain couldn't be used.
 */
export type KeyState = "waiting" | "ready" | "locked" | "unavailable";

export type MessengerState = {
  me: string | null;
  data: MessengerData | null;
  loading: boolean;
  failed: boolean;
  threads: Readonly<Record<string, Thread>>;
  /** Why the last message didn't go, by conversation. */
  sendError: Readonly<Record<string, string>>;
  /** Opening a conversation with someone, by their account. */
  opening: string | null;
  /**
   * Who is on the other side of a conversation opened here before anything
   * was written in it, which the list leaves out, by conversation.
   */
  peers: Readonly<Record<string, string>>;
  keys: KeyState;
  /** The member's published key version. */
  keyVersion: number | null;
  /** The version their recovery phrase's backup holds, if they keep one. */
  backupVersion: number | null;
  /** The key (`keyId`) of each relative whose safety code they checked. */
  verified: Readonly<Record<string, string>>;
  /** Each member's current key as this phone has pinned it (`keyId`). */
  keyIds: Readonly<Record<string, string>>;
  /** Whom the member has blocked (Step 177.3), once Message Security asks. */
  blocks: readonly BlockedMember[] | null;
};

const EMPTY_THREAD: Thread = { messages: [], more: false, loading: false, failed: false };

const INITIAL: MessengerState = {
  me: null,
  data: null,
  loading: false,
  failed: false,
  threads: {},
  sendError: {},
  opening: null,
  peers: {},
  keys: "waiting",
  keyVersion: null,
  backupVersion: null,
  verified: {},
  keyIds: {},
  blocks: null,
};

let state: MessengerState = INITIAL;
const listeners = new Set<() => void>();

function set(next: Partial<MessengerState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function setThread(id: string, next: Partial<Thread>) {
  set({
    threads: {
      ...state.threads,
      [id]: { ...(state.threads[id] ?? EMPTY_THREAD), ...next },
    },
  });
}

let channel: RealtimeChannel | null = null;
let listRead: Promise<void> | null = null;
let listAgain = false;
/** The conversation on screen, while the app is in front. */
let focused: string | null = null;

/** This phone's keyring for the member, once found or made. */
let keyring: Keyring | null = null;
/** Members' published keys this phone accepts, by member and version. */
const publicKeys = new Map<string, Map<number, PublicKey>>();
/** Every key this phone has seen, pinned the first time (`checkPin`). */
let pins: Pins = {};
/** Each conversation's members' current keys, to seal to. */
const sealTo = new Map<string, Recipient[]>();
/**
 * Messages this phone has read, by id: a sent message never changes, and
 * reading one takes Hermes tens of milliseconds, so a thread or the list
 * read again doesn't read them all again. Only what read cleanly is kept.
 */
const readCache = new Map<string, { ciphertext: string; message: ChatMessage }>();

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/** Published keys as the server hands them over, unchecked. */
async function fetchKeys(userIds: readonly string[]): Promise<{ userId: string; key: PublicKey }[]> {
  const { data } = await supabase.rpc("messaging_keys_of", { p_users: [...userIds] });
  return (data ?? []).flatMap((row) => {
    const box = fromBase64(row.box_public);
    const sign = fromBase64(row.sign_public);
    return box && sign
      ? [{ userId: row.user_id, key: { version: row.version, boxPublic: box, signPublic: sign } }]
      : [];
  });
}

/**
 * Read the published keys of anyone not yet known, keeping only real keys
 * that match what this phone pinned (a key swapped under a version it
 * knows is dropped), and pinning the rest.
 */
async function ensurePublicKeys(userIds: readonly string[]): Promise<void> {
  const missing = [...new Set(userIds)].filter((id) => !publicKeys.has(id));
  if (missing.length === 0) return;
  const fetched = await fetchKeys(missing);
  for (const id of missing) publicKeys.set(id, new Map());
  let next = pins;
  for (const { userId, key } of fetched) {
    const check = checkPin(next, userId, key);
    if (!check.ok) continue;
    next = check.pins;
    publicKeys.get(userId)?.set(key.version, key);
  }
  if (next !== pins && state.me) {
    pins = next;
    await savePins(state.me, pins);
  }
  const keyIds = { ...state.keyIds };
  for (const id of missing) {
    const latest = latestPublicKey(id);
    if (latest) keyIds[id] = keyId(latest);
    else delete keyIds[id];
  }
  set({ keyIds });
}

/** Pin this phone's own keys, so the server can't stand in another for them. */
async function pinOwn(me: string, ring: Keyring) {
  let next = pins;
  for (const [version, keys] of Object.entries(ring)) {
    const check = checkPin(next, me, { version: Number(version), ...keys });
    if (check.ok) next = check.pins;
  }
  if (next !== pins) {
    pins = next;
    await savePins(me, pins);
  }
}

/** The published key for `me` at `version`, as the server has it. */
async function publishedOwn(me: string, version: number): Promise<PublicKey | null> {
  return (await fetchKeys([me])).find((k) => k.key.version === version)?.key ?? null;
}

/** Forget what's known of someone's keys, so they're read afresh. */
function forgetPublicKeys(userIds: readonly string[]) {
  for (const id of userIds) publicKeys.delete(id);
}

function publicKey(userId: string, version: number): PublicKey | null {
  return publicKeys.get(userId)?.get(version) ?? null;
}

function latestPublicKey(userId: string): PublicKey | null {
  const versions = publicKeys.get(userId);
  if (!versions?.size) return null;
  return versions.get(Math.max(...versions.keys())) ?? null;
}

/**
 * Find or make this member's messaging key on this phone: make it when no
 * device of theirs has one yet, use it where this phone has the published
 * one, and be locked otherwise. A key is kept as pending before it's
 * published, so a lost reply can't orphan it.
 */
async function setUpKeys(me: string) {
  try {
    await withKeyLock(me, async () => {
      const [{ data: mine }, local, pending, verified, pinned] = await Promise.all([
        supabase.rpc("my_messaging_key"),
        loadKeyring(me),
        loadPendingKey(me),
        loadVerified(me),
        loadPins(me),
      ]);
      if (state.me !== me) return;
      pins = pinned;
      const row = mine?.[0];
      let version = row?.version ?? null;
      set({ verified, backupVersion: row?.backup_version ?? null });
      if (local) await pinOwn(me, local);

      if (version == null) {
        // The first key: this phone's own if it kept one, else a new one.
        const had = local ? currentVersion(local) : null;
        const keys = (local && had != null ? local[had] : null) ?? pending ?? newKeyPair();
        await savePendingKey(me, keys);
        const { data: made, error } = await supabase.rpc("publish_messaging_key", {
          p_box_public: toBase64(keys.boxPublic),
          p_sign_public: toBase64(keys.signPublic),
        });
        if (!error && made != null) {
          await adopt(me, { [made]: keys }, made);
          return;
        }
        // Another device made one first, or the reply was lost: read again.
        const { data: again } = await supabase.rpc("my_messaging_key");
        version = again?.[0]?.version ?? null;
      }
      if (version == null) {
        set({ keys: "unavailable" });
        return;
      }

      const published = await publishedOwn(me, version);
      const current = local?.[version];
      if (published && current && matchesPublished(current, published)) {
        keyring = local;
        set({ keys: "ready", keyVersion: version });
      } else if (published && pending && matchesPublished(pending, published)) {
        // Published by this phone, the reply lost on the way back.
        await adopt(me, { [version]: pending }, version);
      } else {
        // Older versions this phone holds still read what was sealed to them.
        keyring = local;
        set({ keys: "locked", keyVersion: version });
      }
    });
  } catch {
    if (state.me === me) set({ keys: "unavailable" });
  }
}

/** This phone holds `ring`, whose `version` is the published current key. */
async function adopt(me: string, ring: Keyring, version: number) {
  keyring = await saveKeyring(me, ring);
  await savePendingKey(me, null);
  await pinOwn(me, keyring);
  set({ keys: "ready", keyVersion: version });
}

/**
 * Once the phone is given keys (a link, the recovery phrase, starting
 * over), it's ready only if they include the published current one;
 * everything is then read again with them. What to say if not.
 */
async function unlocked(next: Keyring): Promise<string | null> {
  const me = state.me;
  if (!me) return "Couldn't unlock. Try again.";
  const merged = await saveKeyring(me, next);
  await pinOwn(me, merged);
  forgetPublicKeys([me]);
  const { data: mine } = await supabase.rpc("my_messaging_key");
  const row = mine?.[0];
  const version = row?.version ?? null;
  const published = version != null ? await publishedOwn(me, version) : null;
  const current = version != null ? merged[version] : undefined;
  keyring = merged;
  if (!published || !current || !matchesPublished(current, published)) {
    set({ keys: "locked", keyVersion: version });
    return "These keys aren't your current ones. Link this phone from a device you've used lately.";
  }
  // The list's last messages, read with the new keys before it shows.
  const data = state.data ? await readPreviews(state.data) : null;
  set({
    keys: "ready",
    keyVersion: version,
    backupVersion: row?.backup_version ?? null,
    threads: {},
    data,
  });
  await loadList();
  if (focused) void showThread(focused);
  return null;
}

// ---------------------------------------------------------------------------
// Reading messages
// ---------------------------------------------------------------------------

/** A stored message read here, or marked with why it couldn't be. */
async function read(wire: WireMessage, knownPeer?: string | null): Promise<ChatMessage> {
  const base = {
    id: wire.id,
    conversationId: wire.conversation_id,
    senderId: wire.sender_id,
    createdAt: wire.created_at,
    senderKeyVersion: wire.sender_key_version,
  };
  const known = readCache.get(wire.id);
  if (
    known &&
    known.ciphertext === wire.ciphertext &&
    known.message.senderId === wire.sender_id &&
    known.message.conversationId === wire.conversation_id
  ) {
    return known.message;
  }
  const ciphertext = fromBase64(wire.ciphertext);
  const nonce = fromBase64(wire.nonce);
  const signature = fromBase64(wire.signature);
  if (!ciphertext || !nonce || !signature || !state.me) {
    return { ...base, body: "", status: "unreadable" };
  }
  if (!keyring) return { ...base, body: "", status: "locked" };
  // In a direct conversation, only its two members write (the server
  // can't slip in someone else's message).
  const peer = knownPeer ?? peerOf(wire.conversation_id);
  if (wire.sender_id !== state.me && (!peer || wire.sender_id !== peer)) {
    return { ...base, body: "", status: "unverified" };
  }
  let signer: PublicKey | null = null;
  if (wire.sender_id === state.me && keyring[wire.sender_key_version]) {
    // This phone's own key, not the server's copy of it.
    signer = { version: wire.sender_key_version, ...keyring[wire.sender_key_version] };
  } else {
    await ensurePublicKeys([wire.sender_id]);
    signer = publicKey(wire.sender_id, wire.sender_key_version);
    if (!signer) {
      // A key made since they were last read.
      forgetPublicKeys([wire.sender_id]);
      await ensurePublicKeys([wire.sender_id]);
      signer = publicKey(wire.sender_id, wire.sender_key_version);
    }
  }
  const result = decryptMessage(
    {
      id: wire.id,
      conversationId: wire.conversation_id,
      senderId: wire.sender_id,
      senderKeyVersion: wire.sender_key_version,
      ciphertext,
      nonce,
      signature,
      keyVersion: wire.key_version,
      sealedKey: wire.sealed_key ? fromBase64(wire.sealed_key) : null,
    },
    { userId: state.me, keyring },
    signer?.signPublic ?? null,
  );
  if (!result.ok) return { ...base, body: "", status: result.reason };
  const message = { ...base, body: result.text };
  readCache.set(wire.id, { ciphertext: wire.ciphertext, message });
  return message;
}

/** The other member of a direct conversation, as this phone knows it. */
function peerOf(conversationId: string): string | null {
  return (
    state.data?.conversations.find((c) => c.id === conversationId)?.otherUserId ??
    state.peers[conversationId] ??
    null
  );
}

/** Each conversation's last message, read for the list. */
async function readPreviews(data: MessengerData): Promise<MessengerData> {
  await ensurePublicKeys(data.conversations.flatMap((c) => (c.last ? [c.last.sender_id] : [])));
  const conversations = await Promise.all(
    data.conversations.map(async (c) => {
      if (!c.last) return c;
      const m = await read(c.last, c.otherUserId);
      return { ...c, lastBody: m.body, lastStatus: m.status };
    }),
  );
  return { ...data, conversations };
}

/**
 * Read the list again; one read at a time. Asked while one is on its way
 * (a message landing during the first read), it reads once more after, so
 * what came meanwhile isn't missed.
 */
function loadList(): Promise<void> {
  if (listRead) {
    listAgain = true;
    return listRead;
  }
  const me = state.me;
  set({ loading: true });
  listRead = loadMessenger()
    .then(async (fresh) => {
      const data = await readPreviews(fresh);
      if (state.me === me) set({ data, loading: false, failed: false });
    })
    .catch(() => set({ loading: false, failed: !state.data }))
    .finally(() => {
      listRead = null;
      if (listAgain) {
        listAgain = false;
        void loadList();
      }
    });
  return listRead;
}

/** The conversation in front of the member, if the app shows one. */
function openThreadId(): string | null {
  return AppState.currentState === "active" ? focused : null;
}

async function onMessage(payload: unknown) {
  const wire = parseWireMessage(payload);
  if (!wire) return;
  const message = await read(wire);
  const thread = state.threads[message.conversationId];
  if (thread) {
    setThread(message.conversationId, { messages: mergeMessages(thread.messages, [message]) });
  }
  const list = state.data
    ? withIncoming(state.data.conversations, message, state.me ?? "", openThreadId())
    : null;
  if (list && state.data) set({ data: { ...state.data, conversations: list } });
  else void loadList();
  if (openThreadId() === message.conversationId && message.senderId !== state.me)
    void markRead(message.conversationId);
}

function onRead(payload: unknown) {
  const read = parseReadEvent(payload);
  if (!read || !state.data) return;
  set({
    data: {
      ...state.data,
      conversations: withRead(state.data.conversations, read.conversationId, read.lastReadAt),
    },
  });
}

/** Its sender deleted a message (Step 177.5): it goes from here too. */
function onDeleted(payload: unknown) {
  const gone = parseDeletedEvent(payload);
  if (!gone) return;
  readCache.delete(gone.id);
  const thread = state.threads[gone.conversationId];
  if (thread) {
    setThread(gone.conversationId, { messages: thread.messages.filter((m) => m.id !== gone.id) });
  }
  // Its last line and unread count may have been that message.
  void loadList();
}

/** The member muted or unmuted a conversation on another device (Step 177.4). */
function onMuted(payload: unknown) {
  const muted = parseMutedEvent(payload);
  if (!muted || !state.data) return;
  set({
    data: {
      ...state.data,
      conversations: withMuted(state.data.conversations, muted.conversationId, muted.mutedUntil),
    },
  });
}

/** The member blocked or unblocked someone on another device (Step 177.3). */
function onBlocks(payload: unknown) {
  if (!parseBlocksEvent(payload)) return;
  void loadList();
  if (state.blocks) void loadBlocks();
}

/** Join the member's inbox; a rejoin after a dropped connection reads the list again. */
async function joinInbox(me: string) {
  // A private channel is joined with the member's own token.
  await supabase.realtime.setAuth();
  if (channel || state.me !== me) return;
  let joinedBefore = false;
  channel = supabase
    .channel(inboxTopic(me), { config: { private: true } })
    .on("broadcast", { event: "message" }, ({ payload }) => void onMessage(payload))
    .on("broadcast", { event: "read" }, ({ payload }) => onRead(payload))
    .on("broadcast", { event: "deleted" }, ({ payload }) => onDeleted(payload))
    .on("broadcast", { event: "muted" }, ({ payload }) => onMuted(payload))
    .on("broadcast", { event: "blocks" }, ({ payload }) => onBlocks(payload))
    .subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      if (joinedBefore) void loadList();
      joinedBefore = true;
    });
}

let started: string | null = null;
let appState: { remove: () => void } | null = null;

/** Wake the messenger for `me`, once a sign-in. */
function start(me: string) {
  if (started === me) return;
  // A conversation already on screen (opened straight into) stays it.
  const onScreen = focused;
  stop();
  focused = onScreen;
  started = me;
  set({ me });
  // Keys first, so the list's last messages can be read; then the
  // conversation on screen, which needs the list to know who's in it.
  void setUpKeys(me)
    .then(() => loadList())
    .then(() => {
      if (started === me && focused) void showThread(focused);
    });
  void joinInbox(me).catch(() => {
    // No inbox (offline, or Realtime refused): the list still reads when
    // the messages screen opens.
  });
  // Back in front: read what came while the phone was away, as the web
  // does when its tab is seen again.
  appState = AppState.addEventListener("change", (next) => {
    if (next !== "active" || started !== me) return;
    if (state.keys !== "waiting") void loadList();
    if (focused) void showThread(focused);
  });
}

/** Look for the keys again, once they couldn't be (`unavailable`). */
function retryKeys() {
  const me = state.me;
  if (!me) return;
  set({ keys: "waiting" });
  void setUpKeys(me)
    .then(() => loadList())
    .then(() => {
      if (state.me === me && focused) void showThread(focused);
    });
}

/** Forget everything of the member who was signed in. */
function stop() {
  started = null;
  appState?.remove();
  appState = null;
  if (channel) void supabase.removeChannel(channel);
  channel = null;
  keyring = null;
  pins = {};
  publicKeys.clear();
  sealTo.clear();
  readCache.clear();
  focused = null;
  listAgain = false;
  state = INITIAL;
  for (const listener of listeners) listener();
}

/**
 * A conversation came on screen, or went (`null`): it's read each time it
 * shows, and new messages in it count as read while it's there.
 */
function focus(id: string | null) {
  focused = id;
  // Before the keys are looked for, `start` shows it once they are.
  if (id && state.me && state.keys !== "waiting") void showThread(id);
}

/**
 * Read a thread's newest page each time it's shown (one deleted elsewhere
 * drops out, Step 177.5), then mark it read.
 */
async function showThread(id: string) {
  // The other member's keys afresh: a changed code shows as the thread opens.
  const peer = peerOf(id);
  if (peer) {
    forgetPublicKeys([peer]);
    await ensurePublicKeys([peer]);
  }
  await loadThread(id);
  void markRead(id);
}

/** A page of a thread: the newest, or the one before `before`. */
async function loadThread(id: string, before?: string) {
  const had = state.threads[id];
  if (had?.loading) return;
  setThread(id, { loading: true, failed: false });
  const { data, error } = await supabase.rpc("thread_messages", {
    p_conversation: id,
    p_before: before,
    p_limit: THREAD_PAGE,
  });
  if (error) {
    setThread(id, { loading: false, failed: true });
    return;
  }
  const rows = (data ?? []).flatMap((row) => {
    const wire = parseWireMessage({ ...row, conversation_id: id });
    return wire ? [wire] : [];
  });
  const page = await Promise.all(rows.map((wire) => read(wire)));
  const current = state.threads[id]?.messages ?? [];
  const full = (data ?? []).length === THREAD_PAGE;
  setThread(id, {
    // The newest page again replaces what it covers, so a deleted message
    // goes; an older page only adds.
    messages: before ? mergeMessages(current, page) : withNewestPage(current, page, full),
    // An older page read before says whether more wait beyond it.
    more: before || !had?.messages.length ? full : (state.threads[id]?.more ?? full),
    loading: false,
  });
}

/** Read up to the newest message shown, if it's newer than what's read. */
async function markRead(id: string) {
  if (openThreadId() !== id) return;
  const messages = state.threads[id]?.messages;
  const newest = messages?.filter((m) => !m.pending).at(-1);
  const summary = state.data?.conversations.find((c) => c.id === id);
  if (!newest || !summary) return;
  if (
    !summary.unread &&
    summary.lastReadAt &&
    Date.parse(summary.lastReadAt) >= Date.parse(newest.createdAt)
  )
    return;
  if (state.data) {
    set({
      data: {
        ...state.data,
        conversations: withRead(state.data.conversations, id, newest.createdAt),
      },
    });
  }
  await supabase.rpc("mark_conversation_read", { p_conversation: id, p_up_to: newest.createdAt });
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/**
 * Who a message is sealed to: this phone's own current key for the sender
 * (never the server's copy of it), and the other member's current key, as
 * pinned. Refused when the server lists anyone but the two of them, serves
 * a key this phone pinned differently, or the other member's key changed
 * since this member verified it.
 */
async function recipientsOf(
  id: string,
  fresh = false,
): Promise<Recipient[] | "no-key" | "untrusted" | "changed" | "locked"> {
  if (!fresh && sealTo.has(id)) return sealTo.get(id)!;
  const me = state.me;
  const version = state.keyVersion;
  const own = version != null ? keyring?.[version] : undefined;
  if (!me || version == null || !own) return "locked";
  const { data, error } = await supabase.rpc("conversation_keys", { p_conversation: id });
  if (error || !data?.length) throw new Error("keys");
  const peer = peerOf(id);
  const members = data.map((row) => row.user_id);
  if (!peer || members.length !== 2 || !members.includes(me) || !members.includes(peer)) {
    return "untrusted";
  }
  const recipients: Recipient[] = [];
  for (const row of data) {
    if (row.user_id === me) {
      if (row.version !== version) return "locked";
      recipients.push({ userId: me, version, boxPublic: own.boxPublic });
      continue;
    }
    const box = row.box_public ? fromBase64(row.box_public) : null;
    const sign = row.sign_public ? fromBase64(row.sign_public) : null;
    if (row.version == null || !box || !sign) return "no-key";
    const key = { version: row.version, boxPublic: box, signPublic: sign };
    const check = checkPin(pins, row.user_id, key);
    if (!check.ok) return "untrusted";
    if (check.pins !== pins) {
      pins = check.pins;
      await savePins(me, pins);
    }
    const verified = state.verified[row.user_id];
    if (verified && verified !== keyId(key)) return "changed";
    recipients.push({ userId: row.user_id, version: row.version, boxPublic: box });
  }
  sealTo.set(id, recipients);
  return recipients;
}

function sendFailed(id: string, message: string) {
  set({ sendError: { ...state.sendError, [id]: message } });
}

/** Send a message: encrypted here, shown at once, confirmed by the database. */
async function send(id: string, text: string): Promise<boolean> {
  const body = trimMessage(text);
  const me = state.me;
  if (!body || !me) return false;
  const version = state.keyVersion;
  const keys = version != null ? keyring?.[version] : undefined;
  if (state.keys !== "ready" || version == null || !keys) {
    sendFailed(id, sendErrorText("LOCKED"));
    return false;
  }
  const messageId = randomUUID();
  const temp: ChatMessage = {
    id: messageId,
    conversationId: id,
    senderId: me,
    body,
    createdAt: new Date().toISOString(),
    senderKeyVersion: version,
    pending: true,
  };
  if (state.sendError[id]) {
    const sendError = { ...state.sendError };
    delete sendError[id];
    set({ sendError });
  }
  setThread(id, { messages: mergeMessages(state.threads[id]?.messages ?? [], [temp]) });
  const drop = () =>
    setThread(id, {
      messages: (state.threads[id]?.messages ?? []).filter((m) => m.id !== messageId),
    });

  let error: { message?: string } | null = null;
  let sentAt: string | null = null;
  // Once more with fresh keys if someone's changed since they were read.
  for (const fresh of [false, true]) {
    let recipients: Awaited<ReturnType<typeof recipientsOf>>;
    try {
      recipients = await recipientsOf(id, fresh);
    } catch {
      error = { message: "keys" };
      break;
    }
    if (typeof recipients === "string") {
      error = {
        message: {
          "no-key": "NO_KEY",
          untrusted: "UNTRUSTED",
          changed: "CODE_CHANGED",
          locked: "LOCKED",
        }[recipients],
      };
      break;
    }
    const sealed = encryptMessage(
      body,
      { id: messageId, conversationId: id, senderId: me, senderKeyVersion: version },
      keys.signSecret,
      recipients,
    );
    const result = await supabase.rpc("send_message", {
      p_conversation: id,
      p_id: messageId,
      p_ciphertext: toBase64(sealed.ciphertext),
      p_nonce: toBase64(sealed.nonce),
      p_signature: toBase64(sealed.signature),
      p_sender_key_version: version,
      p_keys: sealed.keys.map((k) => ({
        user_id: k.userId,
        key_version: k.version,
        sealed_key: toBase64(k.sealedKey),
      })),
    });
    error = result.error;
    sentAt = result.data?.[0]?.created_at ?? null;
    if (!error?.message?.includes("KEYS_CHANGED")) break;
  }

  if (error || !sentAt) {
    drop();
    sendFailed(id, sendErrorText(error?.message));
    // Refused for good: the list says why, and New Message drops them.
    if (/NO_SHARED_TREE|BLOCKED/.test(error?.message ?? "")) void loadList();
    return false;
  }
  const sent: ChatMessage = { ...temp, createdAt: sentAt, pending: false };
  setThread(id, {
    messages: mergeMessages(
      (state.threads[id]?.messages ?? []).filter((m) => m.id !== messageId),
      [sent],
    ),
  });
  const list = state.data ? withIncoming(state.data.conversations, sent, me, id) : null;
  if (list && state.data) set({ data: { ...state.data, conversations: list } });
  else void loadList();
  return true;
}

/**
 * Delete one of your own messages (Step 177.5): its ciphertext and every
 * sealed key go, and each member's inbox is told, so their other devices
 * drop it. What to say if it couldn't be.
 */
async function deleteMessage(conversationId: string, messageId: string): Promise<string | null> {
  const had = state.threads[conversationId]?.messages ?? [];
  setThread(conversationId, { messages: had.filter((m) => m.id !== messageId) });
  const { error } = await supabase.rpc("delete_message", { p_message: messageId });
  if (error) {
    setThread(conversationId, {
      messages: mergeMessages(state.threads[conversationId]?.messages ?? [], had),
    });
    return "Couldn't delete it. Try again.";
  }
  void loadList();
  return null;
}

/**
 * Mute a conversation for `hours`, or until unmuted (`null`); `unmute`
 * ends it (Step 177.4). Muted, it's left out of the badge's count.
 */
async function mute(conversationId: string, hours: number | null | "unmute"): Promise<boolean> {
  const until = hours === "unmute" ? null : muteUntil(hours);
  const before = state.data?.conversations.find((c) => c.id === conversationId)?.mutedUntil ?? null;
  const apply = (mutedUntil: string | null) => {
    if (!state.data) return;
    set({
      data: {
        ...state.data,
        conversations: withMuted(state.data.conversations, conversationId, mutedUntil),
      },
    });
  };
  apply(until);
  const { data, error } = await supabase.rpc("mute_conversation", {
    p_conversation: conversationId,
    p_until: until ?? undefined,
  });
  if (error) {
    apply(before);
    return false;
  }
  apply(data ?? null);
  return true;
}

/**
 * Every conversation read on this phone and written out as text (Step
 * 177.6): the server holds only ciphertext, so it can't export them. Read
 * a page at a time, the most a page holds.
 */
async function exportConversations(): Promise<{ text: string; filename: string } | null> {
  const me = state.me;
  if (!me || state.keys !== "ready") return null;
  if (!state.data) await loadList();
  const list = state.data?.conversations;
  if (!list) return null;
  const out: ExportedConversation[] = [];
  for (const c of list) {
    const wires: WireMessage[] = [];
    let before: string | undefined;
    for (;;) {
      const { data, error } = await supabase.rpc("thread_messages", {
        p_conversation: c.id,
        p_before: before,
        p_limit: 100,
      });
      if (error) return null;
      const rows = (data ?? []).flatMap((row) => {
        const wire = parseWireMessage({ ...row, conversation_id: c.id });
        return wire ? [wire] : [];
      });
      wires.push(...rows);
      if ((data ?? []).length < 100 || rows.length === 0) break;
      before = rows.at(-1)!.created_at;
    }
    const messages = await Promise.all(wires.map((wire) => read(wire, c.otherUserId)));
    out.push({ name: c.name, messages: mergeMessages([], messages) });
  }
  const now = new Date();
  return { text: exportText(out, me, now), filename: exportFilename(now) };
}

/** Whom the member has blocked, for Message Security (Step 177.3). */
async function loadBlocks() {
  const { data, error } = await supabase.rpc("my_blocks");
  if (error) return;
  set({ blocks: (data ?? []).map((b) => ({ userId: b.user_id, name: b.name })) });
}

/**
 * Block someone (Step 177.3), or unblock them: while either has blocked
 * the other, neither can write, and New Message offers neither to the
 * other. What they wrote stays. Whether it worked.
 */
async function block(userId: string, blocked: boolean): Promise<boolean> {
  const { error } = blocked
    ? await supabase.rpc("block_member", { p_user: userId })
    : await supabase.rpc("unblock_member", { p_user: userId });
  if (error) return false;
  await Promise.all([loadList(), state.blocks ? loadBlocks() : null]);
  return true;
}

/**
 * Report one of their messages (Step 177.3) to the Roots of the trees you
 * share and the reviewers, with the words this phone read: the server
 * can't read it. What to say if it couldn't be sent.
 */
async function report(messageId: string, body: string, reason: string): Promise<string | null> {
  const { error } = await supabase.rpc("report_message", {
    p_message: messageId,
    p_body: body,
    p_reason: reason.trim() || undefined,
  });
  return error ? reportErrorText(error.message) : null;
}

/**
 * The conversation with someone, made the first time: its id, or `null`
 * when it couldn't be opened.
 */
async function openWith(userId: string): Promise<string | null> {
  const known = state.data?.conversations.find((c) => c.otherUserId === userId);
  if (known) return known.id;
  set({ opening: userId });
  const { data, error } = await supabase.rpc("open_direct_conversation", { p_with: userId });
  set({ opening: null });
  if (error || !data) return null;
  set({ peers: { ...state.peers, [data]: userId } });
  return data;
}

// ---------------------------------------------------------------------------
// Linking a device, the recovery phrase, starting over, safety codes
// ---------------------------------------------------------------------------

/**
 * A link for the member's other device: this keyring, encrypted under a
 * one-time key that travels only in the link's fragment, kept by the
 * server ten minutes and handed over once. It opens the web's
 * `/messages/link`.
 */
async function makeDeviceLink(): Promise<string | null> {
  if (!keyring || !state.me) return null;
  const key = newLinkKey();
  const id = randomUUID();
  const blob = wrapKeyring(keyring, key, "link", state.me);
  const { error } = await supabase.rpc("put_key_transfer", { p_id: id, p_blob: toBase64(blob) });
  if (error) return null;
  return `${SITE}/messages/link#${id}.${toBase64Url(key)}`;
}

/**
 * The fragment of a link made on another device, from the link as scanned
 * or pasted (`…/messages/link#<id>.<key>`), or `null` for anything else.
 */
export function linkFragment(text: string): string | null {
  const match = /\/messages\/link#([0-9a-f-]{36}\.[A-Za-z0-9_-]+)\s*$/i.exec(text.trim());
  return match ? match[1] : null;
}

/**
 * Open a link made on the member's other device. `null` when it worked,
 * else what to say.
 */
async function takeDeviceLink(fragment: string): Promise<string | null> {
  const me = state.me;
  if (!me) return "Couldn't unlock. Try again.";
  const [id, encoded] = fragment.replace(/^#/, "").split(".");
  const key = encoded ? fromBase64Url(encoded) : null;
  if (!id || !key || key.length !== 32) return "This link didn't work. Make a new one on your other device.";
  const { data, error } = await supabase.rpc("take_key_transfer", { p_id: id });
  if (error || !data) return "This link has expired. Make a new one on your other device.";
  const blob = fromBase64(data);
  const taken = blob ? unwrapKeyring(blob, key, "link", me) : null;
  if (!taken) return "This link didn't work. Make a new one on your other device.";
  return unlocked(taken);
}

/** A new recovery phrase, its backup kept; the words to show once. */
async function makeRecoveryPhrase(): Promise<string | null> {
  if (!keyring || !state.me || state.keyVersion == null) return null;
  const phrase = newRecoveryPhrase();
  const key = backupKeyFromPhrase(phrase);
  if (!key) return null;
  const { error } = await supabase.rpc("put_key_backup", {
    p_blob: toBase64(wrapKeyring(keyring, key, "backup", state.me)),
    p_key_version: state.keyVersion,
  });
  if (error) return null;
  set({ backupVersion: state.keyVersion });
  return phrase;
}

/** Unlock this phone with the recovery phrase; what to say if it can't. */
async function useRecoveryPhrase(phrase: string): Promise<string | null> {
  const me = state.me;
  const key = backupKeyFromPhrase(phrase);
  if (!me) return "Couldn't unlock. Try again.";
  if (!key) return "Those words aren't a recovery phrase. Check each one.";
  const { data } = await supabase.rpc("get_key_backup");
  const backup = data?.[0];
  const blob = backup ? fromBase64(backup.blob) : null;
  if (!blob) return "There's no backup to unlock.";
  const restored = unwrapKeyring(blob, key, "backup", me);
  if (!restored) return "That isn't your recovery phrase.";
  return unlocked(restored);
}

/**
 * Start over on this phone: a new key, for a member who has lost every
 * device that held theirs. What was sealed to the old key stays locked.
 * The key is kept as pending first, so a lost reply can't orphan it.
 */
async function startOver(): Promise<string | null> {
  const me = state.me;
  if (!me) return "Couldn't start over. Try again.";
  const keys: KeyPair = newKeyPair();
  await savePendingKey(me, keys);
  const { data: version, error } = await supabase.rpc("publish_messaging_key", {
    p_box_public: toBase64(keys.boxPublic),
    p_sign_public: toBase64(keys.signPublic),
    p_reset: true,
  });
  sealTo.clear();
  if (!error && version != null) return unlocked({ [version]: keys });
  if (error?.message?.includes("SLOW_DOWN")) {
    return "You've started over too often today. Try again tomorrow.";
  }
  // The reply may have been lost after it was published.
  const { data: mine } = await supabase.rpc("my_messaging_key");
  const current = mine?.[0]?.version ?? null;
  const published = current != null ? await publishedOwn(me, current) : null;
  if (current != null && published && matchesPublished(keys, published)) {
    return unlocked({ [current]: keys });
  }
  return "Couldn't start over. Try again.";
}

/**
 * A conversation's safety code, from both members' current keys; `null`
 * until both have one.
 */
async function codeFor(otherId: string): Promise<{ code: string[]; key: string } | null> {
  const me = state.me;
  const version = state.keyVersion;
  const own = version != null ? keyring?.[version] : undefined;
  if (!me || version == null || !own) return null;
  forgetPublicKeys([otherId]);
  await ensurePublicKeys([otherId]);
  const theirs = latestPublicKey(otherId);
  if (!theirs) return null;
  return {
    code: safetyCode([
      // This phone's own key, so a server can't show both sides a code of
      // its own making.
      { userId: me, key: { version, boxPublic: own.boxPublic, signPublic: own.signPublic } },
      { userId: otherId, key: theirs },
    ]),
    key: keyId(theirs),
  };
}

async function setVerified(otherId: string, key: string | null) {
  if (!state.me) return;
  sealTo.clear();
  set({ verified: await saveVerified(state.me, otherId, key) });
}

export const messenger = {
  start,
  stop,
  retryKeys,
  focus,
  send,
  openWith,
  loadList,
  loadOlder: (id: string) => {
    const oldest = state.threads[id]?.messages.find((m) => !m.pending);
    if (oldest) void loadThread(id, oldest.createdAt);
  },
  retryThread: (id: string) => void loadThread(id),
  deleteMessage,
  mute,
  exportConversations,
  block,
  report,
  loadBlocks: () => void loadBlocks(),
  makeDeviceLink,
  takeDeviceLink,
  makeRecoveryPhrase,
  useRecoveryPhrase,
  startOver,
  codeFor,
  setVerified,
};

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => void listeners.delete(onChange);
}

/** The messenger's state, or a part of it. */
export function useMessenger<T>(select: (s: MessengerState) => T): T {
  return React.useSyncExternalStore(
    subscribe,
    () => select(state),
    () => select(state),
  );
}

/** What the badge says: unread messages, muted conversations left out. */
export function useUnread(): number {
  return useMessenger((s) => (s.data ? totalUnread(s.data.conversations) : 0));
}

/**
 * Who a person's entry belongs to, when the member can write to them: the
 * sheet's **message**. Null until the list is read, and for anyone else.
 */
export function useMessageTarget(personId: string | null): string | null {
  return useMessenger((s) =>
    personId ? (s.data?.contacts.find((c) => c.personId === personId)?.userId ?? null) : null,
  );
}
