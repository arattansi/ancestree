import * as React from "react";

import type { PersonCards } from "@/lib/birthday-cards";
import { supabase } from "@/auth/supabase";

const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? "https://www.ancestree.space";

/**
 * The parts of the web's sheet (`lib/person-sheet.ts`) the phone shows,
 * typed here: the web's types sit in files that read the server's.
 */
export type SheetTree = { id: string; name: string; slug: string; visitor: boolean };
export type SheetPhoto = {
  id: string;
  url: string | null;
  fullUrl: string | null;
  description: string | null;
  status: string;
};
export type SheetStory = {
  id: string;
  title: string | null;
  body: string | null;
  hasRecording: boolean;
  status: string;
  toldBy: string;
  toldOn: string | null;
  toldPrecision: string | null;
  credits: { id: string; name: string; role: string }[];
  /** Everyone it's about the member may see, this person first (Step 183;
   *  missing from a server before it). */
  about?: { id: string; name: string; status: string }[];
};
export type SheetReport = {
  id: string;
  body: string;
  dispute: boolean;
  authorName: string;
};
export type PersonSheet = {
  trees?: SheetTree[];
  reports?: SheetReport[];
  album?: SheetPhoto[];
  stories?: SheetStory[];
  /** Their birthday cards, as the member may see them (Step 217.4). */
  cards?: PersonCards;
};

/** What the full details read beyond the card: the web sheet's sections. */
const WANT = "trees,reports,album,stories,cards";

type SheetState =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; sheet: PersonSheet };

/**
 * Someone's trees, open reports, album and stories, as the web's details
 * sheet reads them (`loadPersonSheet`), from `/api/mobile/person-sheet` as
 * the member (Step 179.5). Read when the person opens, again on `reload`.
 */
/**
 * Bumped whenever the member adds something someone's details show (a
 * photo, a story, a relative): open details read themselves again.
 */
let changes = 0;
const listeners = new Set<() => void>();

/** Something was added that details show: read them again where they're open. */
export function detailsChanged() {
  changes += 1;
  for (const l of listeners) l();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function usePersonSheet(personId: string | null) {
  const [answer, setAnswer] = React.useState<{ key: string; state: SheetState } | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const changed = React.useSyncExternalStore(subscribe, () => changes);
  const key = personId ? `${personId}:${attempt}:${changed}` : null;

  React.useEffect(() => {
    if (!personId || !key) return;
    let live = true;
    void readSheet(personId).then((state) => {
      if (live) setAnswer({ key, state });
    });
    return () => {
      live = false;
    };
  }, [personId, key]);

  // While it's read again, what was read stays on screen.
  const state: SheetState = answer
    ? answer.key === key || answer.key.startsWith(`${personId}:`)
      ? answer.state
      : { status: "loading" }
    : { status: "loading" };
  const reload = React.useCallback(() => setAttempt((n) => n + 1), []);
  return { state, reload };
}

async function readSheet(personId: string): Promise<SheetState> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { status: "failed", message: "Sign in again." };
  try {
    const response = await fetch(
      `${SITE}/api/mobile/person-sheet?person=${encodeURIComponent(personId)}&want=${WANT}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = (await response.json().catch(() => null)) as
      | { sheet?: PersonSheet; error?: string }
      | null;
    if (!response.ok || !body?.sheet) {
      return {
        status: "failed",
        message: typeof body?.error === "string" ? body.error : "Couldn’t load their details.",
      };
    }
    return { status: "ready", sheet: body.sheet };
  } catch {
    return { status: "failed", message: "No connection. Try again." };
  }
}
