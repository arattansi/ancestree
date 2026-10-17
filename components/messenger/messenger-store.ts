"use client";

import * as React from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import {
  inboxTopic,
  mergeMessages,
  parseInboxMessage,
  parseReadEvent,
  sendErrorText,
  THREAD_PAGE,
  trimMessage,
  withIncoming,
  withRead,
  type ChatMessage,
  type MessengerData,
} from "@/lib/messenger";
import type { createClient } from "@/lib/supabase/client";

/*
 * The messenger's state (Step 174), outside React so the pop-up and a
 * person's sheet ("message") share it without sharing a tree of
 * components. One a page: it wakes once the page is idle, reads the list
 * (`/api/messages`) and joins the member's own inbox, a private Realtime
 * channel every new message of theirs is sent to (the migration's
 * trigger), so the badge and an open thread keep up without asking.
 */

export type MessengerView =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "thread"; id: string };

export type Thread = {
  messages: ChatMessage[];
  /** Older messages wait to be read. */
  more: boolean;
  loading: boolean;
  failed: boolean;
};

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

/** The browser's Supabase client, fetched with its code the first time. */
function client(): Promise<Supabase> {
  supabase ??= import("@/lib/supabase/client").then((m) => m.createClient());
  return supabase;
}

/** Read the list again; one read at a time. */
function loadList(): Promise<void> {
  if (listRead) return listRead;
  set({ loading: true });
  listRead = fetch("/api/messages", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as MessengerData;
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

function onMessage(payload: unknown) {
  const message = parseInboxMessage(payload);
  if (!message) return;
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
    .on("broadcast", { event: "message" }, ({ payload }) => onMessage(payload))
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
  void loadList();
  void joinInbox(me).catch(() => {
    // No inbox (offline, or Realtime refused): the list still reads when
    // the pop-up opens.
  });
}

function open(view: MessengerView = state.view) {
  set({ open: true, view });
  if (!state.loading) void loadList();
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
  const had = state.threads[id];
  if (!had || had.failed) await loadThread(id);
  void markRead(id);
}

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

const asMessage = (r: MessageRow): ChatMessage => ({
  id: r.id,
  conversationId: r.conversation_id,
  senderId: r.sender_id,
  body: r.body,
  createdAt: r.created_at,
});

/** A page of a thread: the newest, or the one before `before`. */
async function loadThread(id: string, before?: string) {
  const had = state.threads[id];
  if (had?.loading) return;
  setThread(id, { loading: true, failed: false });
  const db = await client();
  let query = db
    .from("messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(THREAD_PAGE);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) {
    setThread(id, { loading: false, failed: true });
    return;
  }
  const page = (data ?? []).map(asMessage);
  const current = state.threads[id]?.messages ?? [];
  setThread(id, {
    messages: mergeMessages(current, page),
    more: page.length === THREAD_PAGE,
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

let pendingId = 0;

/** Send a message: shown at once, confirmed by the database. */
async function send(id: string, text: string): Promise<boolean> {
  const body = trimMessage(text);
  if (!body || !state.me) return false;
  const temp: ChatMessage = {
    id: `pending:${++pendingId}`,
    conversationId: id,
    senderId: state.me,
    body,
    createdAt: new Date().toISOString(),
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
  const db = await client();
  const { data, error } = await db.rpc("send_message", {
    p_conversation: id,
    p_body: body,
  });
  const without = (state.threads[id]?.messages ?? []).filter(
    (m) => m.id !== temp.id,
  );
  if (error || !data) {
    setThread(id, { messages: without });
    set({ sendError: { ...state.sendError, [id]: sendErrorText(error?.message) } });
    if (error?.message?.includes("NO_SHARED_TREE")) void loadList();
    return false;
  }
  const sent = asMessage(data as MessageRow);
  setThread(id, { messages: mergeMessages(without, [sent]) });
  const list = state.data
    ? withIncoming(state.data.conversations, sent, state.me, id)
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

export const messenger = {
  start,
  open,
  close,
  show,
  send,
  openWith,
  loadList,
  loadOlder: (id: string) => {
    const oldest = state.threads[id]?.messages.find((m) => !m.pending);
    if (oldest) void loadThread(id, oldest.createdAt);
  },
  retryThread: (id: string) => void loadThread(id),
  markRead: (id: string) => void markRead(id),
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
