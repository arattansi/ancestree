import * as React from "react";
import { AppState } from "react-native";

import { supabase } from "@/auth/supabase";

/** One of the member's notices, as the web's bell lists them (Step 77.2). */
export type Notice = {
  id: string;
  type: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  personId: string | null;
  treeName: string | null;
};

type NoticesState = {
  /** Null until the first read comes back. */
  items: Notice[] | null;
  unread: number;
  failed: boolean;
};

let state: NoticesState = { items: null, unread: 0, failed: false };
const listeners = new Set<() => void>();

function set(next: Partial<NoticesState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

let reading: Promise<void> | null = null;

/**
 * The member's latest fifty notices across their trees, newest first: the
 * same rows the web's bell reads (`listNotifications`), RLS keeping them to
 * the member's own. The phone shows their words; what they ask of a Root
 * (a placement, a claim, a suggested change) is answered on the web for now.
 */
export function readNotices(): Promise<void> {
  if (reading) return reading;
  reading = (async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("id, type, body, created_at, read_at, person_id, trees(name)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      set({ failed: true });
      return;
    }
    const items: Notice[] = (data ?? []).map((n) => {
      const tree = Array.isArray(n.trees) ? n.trees[0] : n.trees;
      return {
        id: n.id,
        type: n.type,
        body: n.body,
        createdAt: n.created_at,
        readAt: n.read_at,
        personId: n.person_id,
        treeName: tree?.name ?? null,
      };
    });
    set({ items, unread: items.filter((n) => !n.readAt).length, failed: false });
  })().finally(() => {
    reading = null;
  });
  return reading;
}

/**
 * Everything waiting marked read, as opening the web's bell does
 * (`markNotificationsRead`). The list keeps showing which were new until it
 * is read again.
 */
export async function markNoticesRead(): Promise<void> {
  if (state.unread === 0) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (!error) set({ unread: 0 });
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function useNotices<T>(select: (s: NoticesState) => T): T {
  return React.useSyncExternalStore(subscribe, () => select(state));
}

/**
 * Keep the count fresh while the member is signed in: read once, and again
 * whenever the app comes back to the front. Mounted once, by the menu bar.
 */
export function useNoticesWake(signedIn: boolean) {
  React.useEffect(() => {
    if (!signedIn) {
      state = { items: null, unread: 0, failed: false };
      return;
    }
    void readNotices();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void readNotices();
    });
    return () => sub.remove();
  }, [signedIn]);
}
