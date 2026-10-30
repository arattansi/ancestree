import type { Session } from "@supabase/supabase-js";
import * as React from "react";

import { supabase } from "@/auth/supabase";
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
    supabase.auth.getSession().then(({ data }) => {
      if (live) setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
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

export const useSession = () => React.useContext(SessionContext);
