import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Profile } from "@/lib/auth";

// `mintClaimInvite` with the member's client, the mint and the tree's
// answers stubbed: what it asks the database, and what it says when refused.
type Reply = { data?: unknown; error?: { message: string } | null };
type Chain = { table: string; filters: Record<string, unknown> };

let tables: (chain: Chain) => Reply;
let rpcs: { fn: string; args: unknown }[];
let mayInvite: boolean;
let role: string | null;
let placed: boolean;
let minted: { treeId: string; personId?: string; recipients: unknown[] }[];

function query(table: string) {
  const chain: Chain = { table, filters: {} };
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "maybeSingle") {
          return async () => {
            const answer = tables(chain);
            return { data: answer.data ?? null, error: answer.error ?? null };
          };
        }
        return (...args: unknown[]) => {
          if (prop === "eq") chain.filters[String(args[0])] = args[1];
          return builder;
        };
      },
    },
  );
  return builder;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => query(table),
    rpc: async (fn: string, args: unknown) => {
      rpcs.push({ fn, args });
      return { data: mayInvite, error: null };
    },
  }),
}));
vi.mock("@/lib/tree-context", () => ({ getRoleIn: async () => role }));
vi.mock("@/lib/placements.server", () => ({ isPlacedOn: async () => placed }));
vi.mock("@/lib/invite-mint.server", () => ({
  mintInvites: async (input: {
    treeId: string;
    personId?: string;
    recipients: unknown[];
  }) => {
    minted.push(input);
    return [{ inviteId: "invite-1", emailed: true }];
  },
}));

import { mintClaimInvite } from "@/lib/claim-invite-send.server";

const HOME = "7a1b2c3d-0000-4000-8000-0000000000a1";
const NEW = "7a1b2c3d-0000-4000-8000-0000000000a2";
const OMAR = "00000000-0000-4000-8000-0000000000b2";
const SOFIA = { auth_user_id: "sofia", display_name: "Sofia Hassan" } as Profile;

/** Omar's entry as someone who may read it sees it. */
const ENTRY = {
  id: OMAR,
  tree_id: HOME,
  first_name: "Omar",
  preferred_name: null,
  last_name: "Hassan",
  owner_user_id: "karim",
  created_by: "karim",
};
/** What a tree showing only his basic card holds of him. */
const CARD = {
  id: OMAR,
  home_tree_id: HOME,
  first_name: "Omar",
  preferred_name: null,
  last_name: "Hassan",
};

beforeEach(() => {
  rpcs = [];
  minted = [];
  mayInvite = true;
  role = "admin";
  placed = true;
  tables = (chain) => (chain.table === "people" ? { data: ENTRY } : { data: null });
});

describe("mintClaimInvite", () => {
  it("asks whether the entry is theirs to hand over into the tree they join", async () => {
    const sent = await mintClaimInvite(SOFIA, OMAR, " Omar@Example.com ", NEW);
    expect(sent).toEqual({ email: "omar@example.com", minted: true });
    expect(rpcs).toEqual([
      { fn: "can_invite_to_claim_on", args: { p_tree: NEW, p_person_id: OMAR } },
    ]);
    expect(minted).toHaveLength(1);
    expect(minted[0].treeId).toBe(NEW);
    expect(minted[0].personId).toBe(OMAR);
  });

  it("joins the entry's home tree when no tree is named", async () => {
    await mintClaimInvite(SOFIA, OMAR, "omar@example.com");
    expect(rpcs[0].args).toEqual({ p_tree: HOME, p_person_id: OMAR });
    expect(minted[0].treeId).toBe(HOME);
  });

  describe("a basic card (Step 84)", () => {
    beforeEach(() => {
      // The entry itself can't be read; the tree's card of it can.
      tables = (chain) =>
        chain.table === "tree_people" &&
        chain.filters.tree_id === NEW &&
        chain.filters.detail === "basic"
          ? { data: CARD }
          : { data: null };
    });

    it("is invited by the name the card shows", async () => {
      const sent = await mintClaimInvite(SOFIA, OMAR, "omar@example.com", NEW);
      expect(sent).toEqual({ email: "omar@example.com", minted: true });
      expect(minted[0].treeId).toBe(NEW);
      expect(minted[0].recipients).toEqual([
        { firstName: "Omar", lastName: "Hassan", email: "omar@example.com" },
      ]);
    });

    it("tells a Root no more than that it can't be claimed", async () => {
      mayInvite = false;
      const sent = await mintClaimInvite(SOFIA, OMAR, "omar@example.com", NEW);
      expect(sent).toEqual({ error: "That entry can’t be claimed." });
      expect(minted).toEqual([]);
    });

    it("tells anyone else it's a Root's to send", async () => {
      mayInvite = false;
      role = "member";
      const sent = await mintClaimInvite(SOFIA, OMAR, "omar@example.com", NEW);
      expect(sent).toEqual({
        error: "Only a Root can invite someone to claim this entry.",
      });
    });

    it("is gone when no tree is named to show it", async () => {
      const sent = await mintClaimInvite(SOFIA, OMAR, "omar@example.com");
      expect(sent).toEqual({ error: "That entry no longer exists." });
      expect(rpcs).toEqual([]);
    });
  });

  it("refuses an entry they can read and can't hand over, as before", async () => {
    mayInvite = false;
    const sent = await mintClaimInvite(SOFIA, OMAR, "omar@example.com", NEW);
    expect(sent.error).toBe(
      "You can invite someone to claim only an entry you can edit. Ask a Root to send this one.",
    );
    expect(minted).toEqual([]);
  });

  it("refuses an entry that isn't on the tree they'd join", async () => {
    placed = false;
    const sent = await mintClaimInvite(SOFIA, OMAR, "omar@example.com", NEW);
    expect(sent).toEqual({ error: "That entry isn't on that tree." });
  });

  it("refuses an entry somebody is behind", async () => {
    tables = (chain) =>
      chain.table === "people"
        ? { data: { ...ENTRY, owner_user_id: "omar" } }
        : { data: null };
    const sent = await mintClaimInvite(SOFIA, OMAR, "omar@example.com", NEW);
    expect(sent).toEqual({ error: "That entry already belongs to a member." });
  });

  it("refuses what isn't an address before asking anything", async () => {
    const sent = await mintClaimInvite(SOFIA, OMAR, "omar", NEW);
    expect(sent).toEqual({ error: "That doesn't look like an email address." });
    expect(rpcs).toEqual([]);
  });
});
