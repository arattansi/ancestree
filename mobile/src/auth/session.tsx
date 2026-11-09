import { isAuthRetryableFetchError, type Session } from "@supabase/supabase-js";
import * as React from "react";

import { storedSession, supabase } from "@/auth/supabase";
import { forgetCards } from "@/cards/cards";
import { forgetPush } from "@/push/push";

type SessionState = {
  /** `undefined` while the stored session is still being read. */
  session: Session | null | undefined;
  signOut: () => Promise<void>;
};

const SessionContext = React.createContext<SessionState>({
  session: undefined,
  signOut: async () => {},
});

/** Whoever is signed in, kept current as Supabase signs in, refreshes and out. */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null | undefined>(
    undefined,
  );

  React.useEffect(() => {
    let live = true;
    // Once Supabase has said someone signed in, out or was refreshed, that
    // stands over anything read at launch.
    let spoken = false;
    void (async () => {
      // Who was signed in when the app last ran, straight from the Keychain:
      // they're in at once. Supabase's own read below refreshes an expired
      // session first, and with no connection that takes it half a minute
      // of retries to answer "nobody".
      const stored = await readStored();
      if (!live || spoken) return;
      if (stored) setSession((now) => (now === undefined ? stored : now));
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!live || spoken) return;
        if (data.session) setSession(data.session);
        // No connection isn't signed out: they stay in on the stored session,
        // and Supabase refreshes it once it can (TOKEN_REFRESHED, below). A
        // session the server refused has been removed, and said so.
        else if (!(error && isAuthRetryableFetchError(error) && stored)) setSession(null);
      } catch {
        // The Keychain couldn't be read: signed out, not a splash for good.
        if (live && !spoken) setSession((now) => now ?? null);
      }
    })();
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // The session at launch is decided above: this event says "nobody"
      // for a refresh that only lacked a connection.
      if (event === "INITIAL_SESSION") return;
      spoken = true;
      setSession(next);
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = React.useMemo<SessionState>(
    () => ({
      session,
      signOut: async () => {
        // This phone tells nobody of their family once they've gone (Step 204).
        await forgetPush().catch(() => {});
        forgetCards();
        await supabase.auth.signOut();
      },
    }),
    [session],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

/** The Keychain's session; a read that throws is tried once more. */
async function readStored(): Promise<Session | null> {
  try {
    return await storedSession();
  } catch {
    await new Promise((done) => setTimeout(done, 300));
    return storedSession().catch(() => null);
  }
}

export const useSession = () => React.useContext(SessionContext);
