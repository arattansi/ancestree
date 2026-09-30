"use client";

import * as React from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import {
  cursorInterval,
  parseCursor,
  peersFrom,
  treeTopic,
  type CursorPoint,
  type Peer,
  type PresenceMeta,
} from "@/lib/presence";
import type { createClient } from "@/lib/supabase/client";

/*
 * The tree's room (Step 57.3): a private Realtime channel, `tree:<id>`, that
 * the members with the tree open join. Presence says who's there; a
 * `cursor` broadcast says where their pointer is. Realtime relays both and
 * keeps neither, and the policies on `realtime.messages` let only the tree's
 * members in.
 *
 * Rooms are shared and closed late. realtime-js hands back the channel it
 * already has for a topic, even one still leaving, so a page that remounts
 * (React's development double-mount, a filter that swaps the canvas) would
 * otherwise rejoin a channel on its way out and hear nothing. A room lives
 * while anyone holds it and for a moment after; a new one for a topic waits
 * for the old one to have left.
 *
 * The Supabase client comes with the first room, not with the page, so the
 * tree draws without waiting for it (Step 87.4, audit C1).
 */

type Room = {
  key: string;
  topic: string;
  userId: string;
  supabase: ReturnType<typeof createClient> | null;
  channel: RealtimeChannel | null;
  joined: boolean;
  holders: number;
  closing: ReturnType<typeof setTimeout> | null;
  closed: boolean;
  meta: PresenceMeta | null;
  tracked: string | null;
  onSync: Set<() => void>;
  onCursor: Set<(payload: unknown) => void>;
};

const CLOSE_AFTER_MS = 1500;
const rooms = new Map<string, Room>();
const leaving = new Map<string, Promise<unknown>>();

function track(room: Room) {
  if (!room.channel || !room.joined || !room.meta) return;
  const next = JSON.stringify(room.meta);
  if (next === room.tracked) return;
  room.tracked = next;
  void room.channel.track(room.meta);
}

function open(topic: string, userId: string): Room {
  const key = `${topic}|${userId}`;
  const existing = rooms.get(key);
  if (existing) {
    if (existing.closing) clearTimeout(existing.closing);
    existing.closing = null;
    existing.holders++;
    return existing;
  }

  const room: Room = {
    key,
    topic,
    userId,
    supabase: null,
    channel: null,
    joined: false,
    holders: 1,
    closing: null,
    closed: false,
    meta: null,
    tracked: null,
    onSync: new Set(),
    onCursor: new Set(),
  };
  rooms.set(key, room);

  void (leaving.get(topic) ?? Promise.resolve())
    .then(() => import("@/lib/supabase/client"))
    .then(async (client) => {
      const supabase = client.createClient();
      // A private channel is joined with the member's own token.
      await supabase.realtime.setAuth();
      if (room.closed) return;
      room.supabase = supabase;
      const channel = supabase.channel(topic, {
        config: {
          private: true,
          presence: { key: userId },
          broadcast: { self: false },
        },
      });
      room.channel = channel;
      channel
        .on("presence", { event: "sync" }, () =>
          room.onSync.forEach((f) => f()),
        )
        .on("broadcast", { event: "cursor" }, ({ payload }) =>
          room.onCursor.forEach((f) => f(payload)),
        )
        .subscribe((status) => {
          room.joined = status === "SUBSCRIBED";
          // A rejoin after a dropped connection tracks afresh.
          room.tracked = null;
          if (room.joined) track(room);
          room.onSync.forEach((f) => f());
        });
    })
    .catch(() => {
      // No room (offline, or Realtime refused): the tree works without it.
    });
  return room;
}

function close(room: Room) {
  room.holders--;
  if (room.holders > 0) return;
  room.closing = setTimeout(() => {
    room.closed = true;
    rooms.delete(room.key);
    if (!room.channel || !room.supabase) return;
    const gone: Promise<unknown> = room.supabase
      .removeChannel(room.channel)
      .catch(() => undefined)
      .finally(() => {
        if (leaving.get(room.topic) === gone) leaving.delete(room.topic);
      });
    leaving.set(room.topic, gone);
  }, CLOSE_AFTER_MS);
}

/** Where everyone's pointer is, outside React state so a pointer moving
 *  redraws the pointers alone, not the canvas. */
export type CursorStore = {
  subscribe: (onChange: () => void) => () => void;
  get: () => ReadonlyMap<string, CursorPoint>;
};

function createCursorStore() {
  let points: ReadonlyMap<string, CursorPoint> = new Map();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((f) => f());
  return {
    subscribe(onChange: () => void) {
      listeners.add(onChange);
      return () => void listeners.delete(onChange);
    },
    get: () => points,
    set(userId: string, point: CursorPoint | null) {
      if (!point && !points.has(userId)) return;
      const next = new Map(points);
      if (point) next.set(userId, point);
      else next.delete(userId);
      points = next;
      emit();
    },
    /** Only these people's pointers: someone gone or away has none. */
    keep(userIds: ReadonlySet<string>) {
      if ([...points.keys()].every((id) => userIds.has(id))) return;
      points = new Map([...points].filter(([id]) => userIds.has(id)));
      emit();
    },
  };
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

const hidden = () => document.visibilityState === "hidden";

/**
 * Join the tree's room while `me` is set: a member on their own tree, never a
 * share link or a visitor. Returns who else is here, their pointers, and a
 * way to send this one's (null when it leaves the canvas).
 */
export function useTreeRoom(
  treeId: string,
  userId: string,
  me: { person: string | null; name: string } | null,
): {
  peers: Peer[];
  cursors: CursorStore;
  sendCursor: (point: CursorPoint | null) => void;
} {
  const enabled =
    !!me && !!userId && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const topic = treeTopic(treeId);
  const [peers, setPeers] = React.useState<Peer[]>([]);
  const [store] = React.useState(createCursorStore);
  const roomRef = React.useRef<Room | null>(null);
  // How many others are here, for how often to send.
  const othersRef = React.useRef(0);
  const away = React.useSyncExternalStore(
    subscribeVisibility,
    hidden,
    () => false,
  );

  React.useEffect(() => {
    if (!enabled) return;
    const room = open(topic, userId);
    roomRef.current = room;
    const onSync = () => {
      const next = room.joined
        ? peersFrom(
            (room.channel?.presenceState() ?? {}) as Record<
              string,
              Partial<PresenceMeta>[]
            >,
            userId,
          )
        : [];
      othersRef.current = next.filter((p) => !p.away).length;
      store.keep(new Set(next.filter((p) => !p.away).map((p) => p.userId)));
      setPeers(next);
    };
    const onCursor = (payload: unknown) => {
      const cursor = parseCursor(payload);
      if (cursor && cursor.u !== userId) store.set(cursor.u, cursor.point);
    };
    room.onSync.add(onSync);
    room.onCursor.add(onCursor);
    onSync();
    return () => {
      room.onSync.delete(onSync);
      room.onCursor.delete(onCursor);
      roomRef.current = null;
      othersRef.current = 0;
      store.keep(new Set());
      setPeers([]);
      close(room);
    };
  }, [enabled, topic, userId, store]);

  const person = me?.person ?? null;
  const name = me?.name ?? "";
  React.useEffect(() => {
    const room = roomRef.current;
    if (!enabled || !room) return;
    room.meta = { person, name, away };
    track(room);
  }, [enabled, person, name, away]);

  // The latest pointer waits here until it's time to send; `undefined` is
  // nothing waiting, `null` a pointer that has left.
  const pending = React.useRef<CursorPoint | null | undefined>(undefined);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = React.useRef<{ at: number; gone: boolean }>({
    at: 0,
    gone: true,
  });

  const flush = React.useCallback(() => {
    timer.current = null;
    const point = pending.current;
    pending.current = undefined;
    const room = roomRef.current;
    if (point === undefined || !room?.channel || !room.joined) return;
    // Nobody to see it: nothing sent, and a pointer that left twice is
    // said once.
    if (othersRef.current === 0) return;
    if (!point && lastSent.current.gone) return;
    void room.channel.send({
      type: "broadcast",
      event: "cursor",
      payload: point ? { u: userId, ...point } : { u: userId, a: null },
    });
    lastSent.current = { at: Date.now(), gone: !point };
  }, [userId]);

  const sendCursor = React.useCallback(
    (point: CursorPoint | null) => {
      if (!enabled) return;
      pending.current = point;
      if (timer.current) return;
      const wait = Math.max(
        0,
        lastSent.current.at + cursorInterval(othersRef.current) - Date.now(),
      );
      timer.current = setTimeout(flush, wait);
    },
    [enabled, flush],
  );

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // A pointer in a tab that has gone to the background is gone.
  React.useEffect(() => {
    if (away) sendCursor(null);
  }, [away, sendCursor]);

  return { peers, cursors: store, sendCursor };
}
