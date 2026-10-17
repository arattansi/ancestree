"use client";

import * as React from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import {
  keystoreAvailable,
  loadKeyring,
  loadPendingKey,
  loadPins,
  loadVerified,
  saveKeyring,
  savePendingKey,
  savePins,
  saveVerified,
  withKeyLock,
} from "@/components/messenger/keystore";
import type { EntryInvite } from "@/lib/claim-invites";
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
  inboxTopic,
  mergeMessages,
  parseReadEvent,
  parseWireMessage,
  sendErrorText,
  THREAD_PAGE,
  trimMessage,
  withIncoming,
  withRead,
  type ChatMessage,
  type MessengerData,
  type WireMessage,
} from "@/lib/messenger";
import type { createClient } from "@/lib/supabase/client";

/*
 * The messenger's state (Step 174), outside React so the pop-up and a
 * person's sheet ("message") share it without sharing a tree of
 * components. One a page: it wakes once the page is idle, reads the list
 * (`/api/messages`) and joins the member's own inbox, a private Realtime
 * channel every new message of theirs is sent to (the migration's
 * trigger), so the badge and an open thread keep up without asking.
 *
 * End to end (Step 174.6): messages arrive as ciphertext and are read
 * here, with the member's messaging key from this device's keystore. The
 * first device to open the messenger makes the key; another device of
 * theirs is locked until it's linked or the recovery phrase opens it.
 */

export type MessengerView =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "thread"; id: string }
  | { kind: "invite"; target: InviteTarget }
  /** Linking a device and the recovery phrase. */
  | { kind: "security" }
  /** A conversation's safety code. */
  | { kind: "verify"; id: string };

/**
 * Someone on the tree with nobody behind their entry yet (Step 174.5):
 * there's no one to message, so the pop-up offers to invite them by email,
 * as the sheet's claim invite does and by the same rules.
 */
export type InviteTarget = {
  personId: string;
  name: string;
  firstName: string;
  photoUrl: string | null;
  photoCrop: unknown;
  /** The tree they'd join, which shows the entry (Step 84). */
  treeId: string;
  treeName: string;
  /** Whether the reader may send the invite (`canInviteToClaim`). */
  canInvite: boolean;
  /** Invites already sent for the entry, as the sheet lists them. */
  invites: EntryInvite[];
};

export type Thread = {
  messages: ChatMessage[];
  /** Older messages wait to be read. */
  more: boolean;
  loading: boolean;
  failed: boolean;
};

/**
 * This device's keys: `waiting` while they're looked for, `ready` to read
 * and send, `locked` when the member's key lives on another device (or
 * changed there), `unavailable` where the browser can't keep keys.
 */
export type KeyState = "waiting" | "ready" | "locked" | "unavailable";

export type MessengerState = {
  me: string | null;
  data: MessengerData | null;
  loading: boolean;
  failed: boolean;
  open: boolean;
  view: MessengerView;
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
  /** Each member's current key as this device has pinned it (`keyId`). */
  keyIds: Readonly<Record<string, string>>;
};

type Supabase = ReturnType<typeof createClient>;

const EMPTY_THREAD: Thread = {
  messages: [],
  more: false,
  loading: false,
  failed: false,
};

let state: MessengerState = {
  me: null,
  data: null,
  loading: false,
  failed: false,
  open: false,
  view: { kind: "list" },
  threads: {},
  sendError: {},
  opening: null,
  peers: {},
  keys: "waiting",
  keyVersion: null,
  backupVersion: null,
  verified: {},
  keyIds: {},
};
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

let supabase: Promise<Supabase> | null = null;
let channel: RealtimeChannel | null = null;
let listRead: Promise<void> | null = null;

/** This device's keyring for the member, once found or made. */
let keyring: Keyring | null = null;
/** Members' published keys this device accepts, by member and version. */
const publicKeys = new Map<string, Map<number, PublicKey>>();
/** Every key this device has seen, pinned the first time (`checkPin`). */
let pins: Pins = {};
/** Each conversation's members' current keys, to seal to. */
const sealTo = new Map<string, Recipient[]>();

/** The browser's Supabase client, fetched with its code the first time. */
function client(): Promise<Supabase> {
  supabase ??= import("@/lib/supabase/client").then((m) => m.createClient());
  return supabase;
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/** Published keys as the server hands them over, unchecked. */
async function fetchKeys(userIds: readonly string[]): Promise<{ userId: string; key: PublicKey }[]> {
  const db = await client();
  const { data } = await db.rpc("messaging_keys_of", { p_users: [...userIds] });
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
 * that match what this device pinned (a key swapped under a version it
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

/** Pin this device's own keys, so the server can't stand in another for them. */
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
 * Find or make this member's messaging key on this device: make it on the
 * first device of theirs to open the messenger, use it where this device
 * has the published one, and be locked anywhere else. A key is kept as
 * pending before it's published, so a lost reply can't orphan it.
 */
async function setUpKeys(me: string) {
  if (!keystoreAvailable()) {
    set({ keys: "unavailable" });
    return;
  }
  try {
    await withKeyLock(me, async () => {
      const db = await client();
      const [{ data: mine }, local, pending, verified, pinned] = await Promise.all([
        db.rpc("my_messaging_key"),
        loadKeyring(me),
        loadPendingKey(me),
        loadVerified(me),
        loadPins(me),
      ]);
      pins = pinned;
      const row = mine?.[0];
      let version = row?.version ?? null;
      set({ verified, backupVersion: row?.backup_version ?? null });
      if (local) await pinOwn(me, local);

      if (version == null) {
        // The first key: this device's own if it kept one, else a new one.
        const had = local ? currentVersion(local) : null;
        const keys = (local && had != null ? local[had] : null) ?? pending ?? newKeyPair();
        await savePendingKey(me, keys);
        const { data: made, error } = await db.rpc("publish_messaging_key", {
          p_box_public: toBase64(keys.boxPublic),
          p_sign_public: toBase64(keys.signPublic),
        });
        if (!error && made != null) {
          await adopt(me, { [made]: keys }, made);
          return;
        }
        // Another device made one first, or the reply was lost: read again.
        const { data: again } = await db.rpc("my_messaging_key");
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
        // Published by this device, the reply lost on the way back.
        await adopt(me, { [version]: pending }, version);
      } else {
        // Older versions this device holds still read what was sealed to them.
        keyring = local;
        set({ keys: "locked", keyVersion: version });
      }
    });
  } catch {
    set({ keys: "unavailable" });
  }
}

/** This device holds `ring`, whose `version` is the published current key. */
async function adopt(me: string, ring: Keyring, version: number) {
  keyring = await saveKeyring(me, ring);
  await savePendingKey(me, null);
  await pinOwn(me, keyring);
  set({ keys: "ready", keyVersion: version });
}

/**
 * Once a device is given keys (a link, the recovery phrase, starting
 * over), it's ready only if they include the published current one;
 * everything is then read again with them. What to say if not.
 */
async function unlocked(next: Keyring): Promise<string | null> {
  const me = state.me;
  if (!me) return "Couldn't unlock. Try again.";
  const merged = await saveKeyring(me, next);
  await pinOwn(me, merged);
  forgetPublicKeys([me]);
  const { data: mine } = await (await client()).rpc("my_messaging_key");
  const row = mine?.[0];
  const version = row?.version ?? null;
  const published = version != null ? await publishedOwn(me, version) : null;
  const current = version != null ? merged[version] : undefined;
  keyring = merged;
  if (!published || !current || !matchesPublished(current, published)) {
    set({ keys: "locked", keyVersion: version });
    return "These keys aren't your current ones. Link this device from one you've used lately.";
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
  if (state.open && state.view.kind === "thread") void showThread(state.view.id);
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
    // This device's own key, not the server's copy of it.
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
  return result.ok
    ? { ...base, body: result.text }
    : { ...base, body: "", status: result.reason };
}

/** The other member of a direct conversation, as this device knows it. */
function peerOf(conversationId: string): string | null {
  return (
    state.data?.conversations.find((c) => c.id === conversationId)?.otherUserId ??
    state.peers[conversationId] ??
    null
  );
}

/** Each conversation's last message, read for the list. */
async function readPreviews(data: MessengerData): Promise<MessengerData> {
  await ensurePublicKeys(
    data.conversations.flatMap((c) => (c.last ? [c.last.sender_id] : [])),
  );
  const conversations = await Promise.all(
    data.conversations.map(async (c) => {
      if (!c.last) return c;
      const m = await read(c.last, c.otherUserId);
      return { ...c, lastBody: m.body, lastStatus: m.status };
    }),
  );
  return { ...data, conversations };
}

/** Read the list again; one read at a time. */
function loadList(): Promise<void> {
  if (listRead) return listRead;
  set({ loading: true });
  listRead = fetch("/api/messages", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      const data = await readPreviews((await res.json()) as MessengerData);
      set({ data, loading: false, failed: false });
    })
    .catch(() => set({ loading: false, failed: !state.data }))
    .finally(() => {
      listRead = null;
    });
  return listRead;
}

/** The conversation in front of the reader, if the pop-up shows one. */
function openThreadId(): string | null {
  if (!state.open || state.view.kind !== "thread") return null;
  if (typeof document !== "undefined" && document.visibilityState !== "visible")
    return null;
  return state.view.id;
}

async function onMessage(payload: unknown) {
  const wire = parseWireMessage(payload);
  if (!wire) return;
  const message = await read(wire);
  const thread = state.threads[message.conversationId];
  if (thread) {
    setThread(message.conversationId, {
      messages: mergeMessages(thread.messages, [message]),
    });
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
      conversations: withRead(
        state.data.conversations,
        read.conversationId,
        read.lastReadAt,
      ),
    },
  });
}

/** Join the member's inbox; a rejoin after a dropped connection reads the list again. */
async function joinInbox(me: string) {
  const db = await client();
  // A private channel is joined with the member's own token.
  await db.realtime.setAuth();
  if (channel || state.me !== me) return;
  let joinedBefore = false;
  channel = db
    .channel(inboxTopic(me), { config: { private: true } })
    .on("broadcast", { event: "message" }, ({ payload }) => void onMessage(payload))
    .on("broadcast", { event: "read" }, ({ payload }) => onRead(payload))
    .subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      if (joinedBefore) void loadList();
      joinedBefore = true;
    });
}

let started: string | null = null;

/** Wake the messenger for `me`, once a page. */
function start(me: string) {
  if (started === me) return;
  started = me;
  set({ me });
  // Keys first, so the list's last messages can be read.
  void setUpKeys(me).then(() => loadList());
  void joinInbox(me).catch(() => {
    // No inbox (offline, or Realtime refused): the list still reads when
    // the pop-up opens.
  });
}

function open(view: MessengerView = state.view) {
  set({ open: true, view });
  if (!state.loading && state.keys !== "waiting") void loadList();
  if (view.kind === "thread") void showThread(view.id);
}

function close() {
  set({ open: false });
}

function show(view: MessengerView) {
  set({ view });
  if (view.kind === "thread") void showThread(view.id);
}

/** Read a thread's newest page the first time it's shown, then mark it read. */
async function showThread(id: string) {
  // The other member's keys afresh: a changed code shows as the thread opens.
  const peer = peerOf(id);
  if (peer) {
    forgetPublicKeys([peer]);
    await ensurePublicKeys([peer]);
  }
  const had = state.threads[id];
  if (!had || had.failed) await loadThread(id);
  void markRead(id);
}

/** A page of a thread: the newest, or the one before `before`. */
async function loadThread(id: string, before?: string) {
  const had = state.threads[id];
  if (had?.loading) return;
  setThread(id, { loading: true, failed: false });
  const db = await client();
  const { data, error } = await db.rpc("thread_messages", {
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
  setThread(id, {
    messages: mergeMessages(current, page),
    more: (data ?? []).length === THREAD_PAGE,
    loading: false,
  });
}

/** Read up to the newest message shown, if it's newer than what's read. */
async function markRead(id: string) {
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
  const db = await client();
  await db.rpc("mark_conversation_read", {
    p_conversation: id,
    p_up_to: newest.createdAt,
  });
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/**
 * Who a message is sealed to: this device's own current key for the
 * sender (never the server's copy of it), and the other member's current
 * key, as pinned. Refused when the server lists anyone but the two of
 * them, serves a key this device pinned differently, or the other member's
 * key changed since this member verified it.
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
  const db = await client();
  const { data, error } = await db.rpc("conversation_keys", { p_conversation: id });
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
  const messageId = crypto.randomUUID();
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
  setThread(id, {
    messages: mergeMessages(state.threads[id]?.messages ?? [], [temp]),
  });
  const drop = () =>
    setThread(id, {
      messages: (state.threads[id]?.messages ?? []).filter((m) => m.id !== messageId),
    });

  const db = await client();
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
    const result = await db.rpc("send_message", {
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
    if (error?.message?.includes("NO_SHARED_TREE")) void loadList();
    return false;
  }
  const sent: ChatMessage = { ...temp, createdAt: sentAt, pending: false };
  setThread(id, {
    messages: mergeMessages(
      (state.threads[id]?.messages ?? []).filter((m) => m.id !== messageId),
      [sent],
    ),
  });
  const list = state.data
    ? withIncoming(state.data.conversations, sent, me, id)
    : null;
  if (list && state.data) set({ data: { ...state.data, conversations: list } });
  else void loadList();
  return true;
}

/** Open the conversation with someone, making it the first time. */
async function openWith(userId: string) {
  set({ open: true, opening: userId });
  const known = state.data?.conversations.find((c) => c.otherUserId === userId);
  if (known) {
    set({ opening: null });
    show({ kind: "thread", id: known.id });
    return;
  }
  const db = await client();
  const { data, error } = await db.rpc("open_direct_conversation", {
    p_with: userId,
  });
  set({ opening: null });
  if (error || !data) {
    set({ view: { kind: "new" } });
    return;
  }
  set({ peers: { ...state.peers, [data]: userId } });
  show({ kind: "thread", id: data });
}

// ---------------------------------------------------------------------------
// Linking a device, the recovery phrase, starting over, safety codes
// ---------------------------------------------------------------------------

/**
 * A link for the member's other device: this keyring, encrypted under a
 * one-time key that travels only in the link's fragment, kept by the
 * server ten minutes and handed over once.
 */
async function makeDeviceLink(): Promise<string | null> {
  if (!keyring || !state.me) return null;
  const key = newLinkKey();
  const id = crypto.randomUUID();
  const blob = wrapKeyring(keyring, key, "link", state.me);
  const { error } = await (await client()).rpc("put_key_transfer", {
    p_id: id,
    p_blob: toBase64(blob),
  });
  if (error) return null;
  return `${window.location.origin}/messages/link#${id}.${toBase64Url(key)}`;
}

/**
 * Open a link made on the member's other device. `null` when it worked,
 * else what to say.
 */
async function takeDeviceLink(me: string, fragment: string): Promise<string | null> {
  const [id, encoded] = fragment.replace(/^#/, "").split(".");
  const key = encoded ? fromBase64Url(encoded) : null;
  if (!id || !key || key.length !== 32) return "This link didn't work. Make a new one on your other device.";
  const db = await client();
  const { data, error } = await db.rpc("take_key_transfer", { p_id: id });
  if (error || !data) return "This link has expired. Make a new one on your other device.";
  const blob = fromBase64(data);
  const taken = blob ? unwrapKeyring(blob, key, "link", me) : null;
  if (!taken) return "This link didn't work. Make a new one on your other device.";
  if (state.me === me) return unlocked(taken);
  await saveKeyring(me, taken);
  return null;
}

/** A new recovery phrase, its backup kept; the words to show once. */
async function makeRecoveryPhrase(): Promise<string | null> {
  if (!keyring || !state.me || state.keyVersion == null) return null;
  const phrase = newRecoveryPhrase();
  const key = backupKeyFromPhrase(phrase);
  if (!key) return null;
  const { error } = await (await client()).rpc("put_key_backup", {
    p_blob: toBase64(wrapKeyring(keyring, key, "backup", state.me)),
    p_key_version: state.keyVersion,
  });
  if (error) return null;
  set({ backupVersion: state.keyVersion });
  return phrase;
}

/** Unlock this device with the recovery phrase; what to say if it can't. */
async function useRecoveryPhrase(phrase: string): Promise<string | null> {
  const me = state.me;
  const key = backupKeyFromPhrase(phrase);
  if (!me) return "Couldn't unlock. Try again.";
  if (!key) return "Those words aren't a recovery phrase. Check each one.";
  const { data } = await (await client()).rpc("get_key_backup");
  const backup = data?.[0];
  const blob = backup ? fromBase64(backup.blob) : null;
  if (!blob) return "There's no backup to unlock.";
  const restored = unwrapKeyring(blob, key, "backup", me);
  if (!restored) return "That isn't your recovery phrase.";
  return unlocked(restored);
}

/**
 * Start over on this device: a new key, for a member who has lost every
 * device that held theirs. What was sealed to the old key stays locked.
 * The key is kept as pending first, so a lost reply can't orphan it.
 */
async function startOver(): Promise<string | null> {
  const me = state.me;
  if (!me) return "Couldn't start over. Try again.";
  const keys: KeyPair = newKeyPair();
  await savePendingKey(me, keys);
  const db = await client();
  const { data: version, error } = await db.rpc("publish_messaging_key", {
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
  const { data: mine } = await db.rpc("my_messaging_key");
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
      // This device's own key, so a server can't show both sides a code of
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
  open,
  close,
  show,
  send,
  openWith,
  loadList,
  /** The pop-up on someone not on ancestree yet, inviting them (Step 174.5). */
  openInvite: (target: InviteTarget) =>
    set({ open: true, view: { kind: "invite", target } }),
  loadOlder: (id: string) => {
    const oldest = state.threads[id]?.messages.find((m) => !m.pending);
    if (oldest) void loadThread(id, oldest.createdAt);
  },
  retryThread: (id: string) => void loadThread(id),
  markRead: (id: string) => void markRead(id),
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

const serverState = state;

/** The messenger's state, or a part of it. */
export function useMessenger<T>(select: (s: MessengerState) => T): T {
  return React.useSyncExternalStore(
    subscribe,
    () => select(state),
    () => select(serverState),
  );
}

/** Whether the messenger has woken on this page, so the sheet may offer it. */
export function useMessengerReady(): boolean {
  return useMessenger((s) => s.me !== null);
}

/**
 * Who a person's entry belongs to, when the reader can write to them: the
 * sheet's **message** (Step 174). Null until the messenger has woken, and
 * for anyone else.
 */
export function useMessageTarget(personId: string | null): string | null {
  return useMessenger((s) =>
    personId
      ? (s.data?.contacts.find((c) => c.personId === personId)?.userId ?? null)
      : null,
  );
}
