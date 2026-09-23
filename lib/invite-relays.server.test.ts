import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `passOnRelay` with the service-role client and the mailer stubbed. Each
// query records its chain of calls and, when awaited, answers from `reply`.
type Step = [method: string, ...args: unknown[]];
type Chain = { table: string; steps: Step[] };
type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };

let lookup: Reply;
let reply: (chain: Chain) => Reply;
let chains: Chain[];
const sent: { to: string; subject: string; html: string }[] = [];
let sendResult: { ok: true } | { ok: false; error: string };

function query(table: string) {
  const chain: Chain = { table, steps: [] };
  chains.push(chain);
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          const answer = reply(chain);
          return (resolve: (value: unknown) => void) =>
            resolve({ data: answer.data ?? null, error: answer.error ?? null });
        }
        return (...args: unknown[]) => {
          chain.steps.push([String(prop), ...args]);
          return builder;
        };
      },
    },
  );
  return builder;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: { p_email: string }) => {
      chains.push({ table: `rpc:${fn}`, steps: [["args", args]] });
      return { data: lookup.data ?? null, error: lookup.error ?? null };
    },
    from: (table: string) => query(table),
  }),
}));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: async (message: { to: string; subject: string; html: string }) => {
    sent.push(message);
    return sendResult;
  },
}));

import { relayHref } from "@/lib/invite-relays";
import { passOnRelay, type RelayAsk } from "@/lib/invite-relays.server";

const RELAY = "6f1c2b3a-0000-4000-8000-000000000305";
const MEMBER = { user_id: "0b9e1c2d-0000-4000-8000-000000000001", email: "amina@example.com" };
const ASK: RelayAsk = {
  firstName: "Zahra",
  lastName: "Suleman",
  email: "zahra@example.com",
  relativeEmail: "amina@example.com",
};

const justNow = () => [{ created_at: new Date().toISOString() }];
const first = (chain: Chain) => chain.steps[0]?.[0];
const hasEq = (chain: Chain, column: string) =>
  chain.steps.some(([m, c]) => m === "eq" && c === column);

/** The ask is new, and within every cap, unless a test says otherwise. */
function defaultReply(chain: Chain): Reply {
  if (first(chain) === "insert") return { data: { id: RELAY } };
  if (first(chain) === "select") return { data: justNow() };
  return {};
}

const logs: string[] = [];

beforeEach(() => {
  lookup = { data: [MEMBER] };
  reply = defaultReply;
  chains = [];
  sent.length = 0;
  logs.length = 0;
  sendResult = { ok: true };
  for (const level of ["info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

const tableChains = () => chains.filter((c) => c.table === "invite_relays");
const ops = (op: string) => tableChains().filter((c) => first(c) === op);

describe("passOnRelay (Step 30.5)", () => {
  it("files nothing and emails nobody when the address isn't a member's", async () => {
    lookup = { data: [] };
    await passOnRelay(ASK);
    expect(chains).toEqual([
      { table: "rpc:invite_relay_recipient", steps: [["args", { p_email: "amina@example.com" }]] },
    ]);
    expect(sent).toEqual([]);
  });

  it("files the ask for the member and emails them a button to it", async () => {
    await passOnRelay(ASK);

    const [insert] = ops("insert");
    expect(insert.steps[0]).toEqual([
      "insert",
      {
        recipient_user_id: MEMBER.user_id,
        first_name: "Zahra",
        last_name: "Suleman",
        email: "zahra@example.com",
      },
    ]);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("amina@example.com");
    expect(sent[0].subject).toBe("Zahra Suleman asked you to invite them to ancestree");
    expect(sent[0].html).toContain(relayHref(RELAY).replace("&", "&amp;"));

    const [update] = ops("update");
    expect(update.steps).toEqual([
      ["update", { email_sent: true }],
      ["eq", "id", RELAY],
    ]);
    expect(ops("delete")).toEqual([]);
  });

  it("counts asks from the address, to the member, and across the site", async () => {
    await passOnRelay(ASK);
    const counts = ops("select");
    expect(counts).toHaveLength(3);
    const fromRequester = counts.find((c) => hasEq(c, "email"))!;
    const toRecipient = counts.find((c) => hasEq(c, "recipient_user_id"))!;
    const overall = counts.find((c) => !hasEq(c, "email") && !hasEq(c, "recipient_user_id"))!;
    expect(fromRequester.steps).toContainEqual(["eq", "email", "zahra@example.com"]);
    expect(fromRequester.steps).toContainEqual(["limit", 4]);
    expect(toRecipient.steps).toContainEqual(["eq", "recipient_user_id", MEMBER.user_id]);
    expect(toRecipient.steps).toContainEqual(["limit", 6]);
    expect(overall.steps).toContainEqual(["limit", 31]);
  });

  it("emails nobody when the same address asked them already", async () => {
    reply = (chain) =>
      first(chain) === "insert" ? { error: { code: "23505" } } : defaultReply(chain);
    await passOnRelay(ASK);
    expect(sent).toEqual([]);
    expect(ops("select")).toEqual([]);
    expect(ops("delete")).toEqual([]);
  });

  it("drops an ask past a cap, keeping no row of it", async () => {
    const now = Date.now();
    const recent = [0, 10, 20].map((m) => ({ created_at: new Date(now - m * 60_000).toISOString() }));
    reply = (chain) =>
      first(chain) === "select" && hasEq(chain, "recipient_user_id")
        ? { data: recent }
        : defaultReply(chain);
    await passOnRelay(ASK);

    expect(sent).toEqual([]);
    const [drop] = ops("delete");
    expect(drop.steps).toEqual([["delete"], ["eq", "id", RELAY]]);
    expect(logs).toContain("[invite-relays] ask to a relative: over a cap, so dropped");
  });

  it("doesn't pass an ask on when it can't count the others", async () => {
    reply = (chain) =>
      first(chain) === "select" && hasEq(chain, "email")
        ? { error: { code: "57014", message: "canceling statement" } }
        : defaultReply(chain);
    await passOnRelay(ASK);
    expect(sent).toEqual([]);
    expect(ops("delete")).toHaveLength(1);
  });

  it("swallows a failure, so it can never reach the newcomer", async () => {
    lookup = { error: { code: "PGRST301", message: "JWT expired" } };
    await expect(passOnRelay(ASK)).resolves.toBeUndefined();
    expect(sent).toEqual([]);
    expect(logs.some((l) => l.includes("couldn't pass it on"))).toBe(true);
  });

  it("records when the email to the member didn't send", async () => {
    sendResult = { ok: false, error: "Resend 422: amina@example.com is not allowed" };
    await passOnRelay(ASK);
    const [update] = ops("update");
    expect(update.steps[0]).toEqual(["update", { email_sent: false }]);
  });

  it("never logs a name or an address", async () => {
    sendResult = { ok: false, error: "Resend 422: amina@example.com is not allowed" };
    await passOnRelay(ASK);
    reply = (chain) =>
      first(chain) === "insert"
        ? { error: { code: "23514", message: "violates check constraint" } }
        : defaultReply(chain);
    await passOnRelay(ASK);
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toMatch(/zahra|amina|suleman/i);
    }
  });
});
