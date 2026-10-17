import * as React from "react";

import { firstDegree, type FirstDegree } from "@/lib/first-degree";
import type { GhostFamily } from "@/lib/leaf-ghosts";
import { useSession } from "@/auth/session";
import { supabase } from "@/auth/supabase";
import {
  loadFamily,
  type Family,
  type FamilyPerson,
  type NoFamily,
} from "@/family/load";

type FamilyState =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "none"; why: NoFamily }
  | { status: "ready"; family: Family };

type FamilyContext = {
  state: FamilyState;
  reload: () => void;
  /** The leaf in the middle of the screen. */
  focusId: string | null;
  /** Leaves walked through to get here, most recent last. */
  trail: string[];
  walkTo: (id: string) => void;
  back: () => void;
  home: () => void;
};

const Context = React.createContext<FamilyContext | null>(null);

const LOADING: FamilyState = { status: "loading" };

/**
 * The signed-in member's family, read once (`loadFamily`), and where they
 * are in it: the leaf on screen and the trail back to the one they came
 * from. Opens on their own leaf.
 */
export function FamilyProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [attempt, setAttempt] = React.useState(0);
  // Which read the state answers: a new member or a retry is loading again
  // until its own answer comes back.
  const key = userId ? `${userId}:${attempt}` : null;
  const [answer, setAnswer] = React.useState<{
    key: string;
    state: FamilyState;
  } | null>(null);
  const state = answer && answer.key === key ? answer.state : LOADING;
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [trail, setTrail] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!userId || !key) return;
    let live = true;
    loadFamily(supabase, userId)
      .then((result) => {
        if (!live) return;
        if (typeof result === "string") {
          setAnswer({ key, state: { status: "none", why: result } });
          return;
        }
        setAnswer({ key, state: { status: "ready", family: result } });
        setFocusId((id) => (id && result.people.has(id) ? id : result.selfId));
      })
      .catch((error: unknown) => {
        if (!live) return;
        setAnswer({
          key,
          state: {
            status: "failed",
            message:
              error instanceof Error ? error.message : "Your trees couldn't be read.",
          },
        });
      });
    return () => {
      live = false;
    };
  }, [userId, key]);

  const value = React.useMemo<FamilyContext>(
    () => ({
      state,
      reload: () => setAttempt((n) => n + 1),
      focusId,
      trail,
      walkTo: (id) => {
        if (!focusId || id === focusId) return;
        setTrail((t) => [...t, focusId]);
        setFocusId(id);
      },
      back: () => {
        const previous = trail[trail.length - 1];
        if (!previous) return;
        setTrail((t) => t.slice(0, -1));
        setFocusId(previous);
      },
      home: () => {
        if (state.status !== "ready") return;
        setTrail([]);
        setFocusId(state.family.selfId);
      },
    }),
    [state, focusId, trail],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFamily(): FamilyContext {
  const context = React.useContext(Context);
  if (!context) throw new Error("useFamily outside FamilyProvider");
  return context;
}

/** Eldest first, the undated after them, then by name: as the tree seats them. */
export function byBirth(people: Map<string, FamilyPerson>) {
  return (a: string, b: string) => {
    const da = people.get(a)?.date_of_birth ?? "9999";
    const db = people.get(b)?.date_of_birth ?? "9999";
    return da < db ? -1 : da > db ? 1 : 0;
  };
}

/** Someone's relatives one line away, each group eldest first. */
export function relativesOf(family: Family, id: string): FirstDegree {
  const degree = firstDegree(id, family.lines);
  const order = byBirth(family.people);
  return {
    parents: degree.parents.sort(order),
    children: degree.children.sort(order),
    spouses: degree.spouses.sort(order),
    siblings: degree.siblings.sort(order),
  };
}

/**
 * Everyone's parents and children on the member's trees, each eldest first:
 * how the leaf view finds the family past its pills (Step 184).
 */
export function lineageOf(family: Family): GhostFamily {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, key: string, id: string) => {
    const list = map.get(key);
    if (!list) map.set(key, [id]);
    else if (!list.includes(id)) list.push(id);
  };
  for (const l of family.lines) {
    if (l.type !== "parent") continue;
    add(parents, l.to_person, l.from_person);
    add(children, l.from_person, l.to_person);
  }
  const order = byBirth(family.people);
  for (const list of [...parents.values(), ...children.values()]) list.sort(order);
  return {
    parentsOf: (id) => parents.get(id) ?? [],
    childrenOf: (id) => children.get(id) ?? [],
  };
}
