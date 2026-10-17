import * as React from "react";

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
};

/** What the full details read beyond the card: the web sheet's sections. */
const WANT = "trees,reports,album,stories";

type SheetState =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; sheet: PersonSheet };

/**
 * Someone's trees, open reports, album and stories, as the web's details
 * sheet reads them (`loadPersonSheet`), from `/api/mobile/person-sheet` as
 * the member (Step 179.5). Read when the person opens, again on `reload`.
 */
export function usePersonSheet(personId: string | null) {
  const [answer, setAnswer] = React.useState<{ key: string; state: SheetState } | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const key = personId ? `${personId}:${attempt}` : null;

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

  const state: SheetState = answer && answer.key === key ? answer.state : { status: "loading" };
  return { state, reload: () => setAttempt((n) => n + 1) };
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
