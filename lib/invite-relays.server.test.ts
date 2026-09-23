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

const NOW = new Date("2026-09-23T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const NOTE = "5e0d1a2b-0000-4000-8000-000000041005";
const RELAY = "6f1c2b3a-0000-4000-8000-000000000305";
const MEMBER = { user_id: "0b9e1c2d-0000-4000-8000-000000000001", email: "amina@example.com" };
const ASK: RelayAsk = {
  firstName: "Zahra",
  lastName: "Suleman",
  email: "zahra@example.com",
  relativeEmail: "amina@example.com",
};

const NOTES = "invite_relay_asks";
const RELAYS = "invite_relays";

const justNow = () => [{ created_at: NOW.toISOString() }];
const first = (chain: Chain) => chain.steps[0]?.[0];
const hasEq = (chain: Chain, column: string) =>
  chain.steps.some(([m, c]) => m === "eq" && c === column);
/** The asks before this one, `minutes` apart from each other. */
const recent = (count: number, minutes = 10) =>
  Array.from({ length: count }, (_, i) => ({ created_at: ago((i + 1) * minutes * MINUTE) }));

/** The ask is new, and within every cap, unless a test says otherwise. */
function defaultReply(chain: Chain): Reply {
  if (first(chain) === "insert") return { data: { id: chain.table === NOTES ? NOTE : RELAY } };
  if (first(chain) === "select") return { data: justNow() };
  return {};
}

const logs: string[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const on = (table: string) => chains.filter((c) => c.table === table);
const ops = (table: string, op: string) => on(table).filter((c) => first(c) === op);
/** The deletes that take one row back, as against the clearing of old ones. */
const takenBack = (table: string) => ops(table, "delete").filter((c) => hasEq(c, "id"));
const looked = () => chains.some((c) => c.table === "rpc:invite_relay_recipient");
const noteCounts = () => ops(NOTES, "select");

describe("passOnRelay: every ask is noted and counted (Step 41.5)", () => {
  it("notes the ask, keeping only the address asking, before anyone is looked up", async () => {
    await passOnRelay(ASK);
    const [note] = ops(NOTES, "insert");
    expect(note.steps[0]).toEqual(["insert", { email: "zahra@example.com" }]);
    const order = chains.map((c) => `${c.table}:${first(c)}`);
    expect(order.indexOf(`${NOTES}:insert`)).toBeLessThan(
      order.indexOf("rpc:invite_relay_recipient:args"),
    );
  });

  it("counts the notes from the address and across the site, before the lookup", async () => {
    await passOnRelay(ASK);
    const counts = noteCounts();
    expect(counts).toHaveLength(2);
    const fromRequester = counts.find((c) => hasEq(c, "email"))!;
    const overall = counts.find((c) => !hasEq(c, "email"))!;
    expect(fromRequester.steps).toContainEqual(["eq", "email", "zahra@example.com"]);
    expect(fromRequester.steps).toContainEqual(["gte", "created_at", ago(DAY)]);
    expect(fromRequester.steps).toContainEqual(["limit", 4]);
    expect(overall.steps).toContainEqual(["gte", "created_at", ago(DAY)]);
    expect(overall.steps).toContainEqual(["limit", 31]);
  });

  it("keeps the note of an ask to an address that isn't a member's, and nothing more", async () => {
    lookup = { data: [] };
    await passOnRelay(ASK);
    expect(looked()).toBe(true);
    expect(ops(NOTES, "insert")).toHaveLength(1);
    expect(takenBack(NOTES)).toEqual([]);
    expect(ops(RELAYS, "insert")).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("drops an ask past the address's cap before the lookup, taking its note back", async () => {
    reply = (chain) =>
      chain.table === NOTES && first(chain) === "select" && hasEq(chain, "email")
        ? { data: [...justNow(), ...recent(3, 60)] }
        : defaultReply(chain);
    await passOnRelay(ASK);

    expect(looked()).toBe(false);
    expect(ops(RELAYS, "insert")).toEqual([]);
    expect(sent).toEqual([]);
    const [drop] = takenBack(NOTES);
    expect(drop.steps).toEqual([["delete"], ["eq", "id", NOTE]]);
    expect(logs).toContain("[invite-relays] ask to a relative: over a cap, so dropped before the lookup");
  });

  it("drops an ask past the site's hourly cap the same way, whoever it's to", async () => {
    lookup = { data: [] };
    reply = (chain) =>
      chain.table === NOTES && first(chain) === "select" && !hasEq(chain, "email")
        ? { data: [...justNow(), ...recent(10, 5)] }
        : defaultReply(chain);
    await passOnRelay(ASK);

    expect(looked()).toBe(false);
    expect(takenBack(NOTES)).toHaveLength(1);
  });

  it("doesn't pass an ask on when it can't count the notes", async () => {
    reply = (chain) =>
      chain.table === NOTES && first(chain) === "select" && hasEq(chain, "email")
        ? { error: { code: "57014", message: "canceling statement" } }
        : defaultReply(chain);
    await passOnRelay(ASK);
    expect(looked()).toBe(false);
    expect(sent).toEqual([]);
    expect(takenBack(NOTES)).toHaveLength(1);
  });

  it("doesn't look anyone up when it can't note the ask", async () => {
    reply = (chain) =>
      chain.table === NOTES && first(chain) === "insert"
        ? { error: { code: "23514", message: "violates check constraint" } }
        : defaultReply(chain);
    await passOnRelay(ASK);
    expect(noteCounts()).toEqual([]);
    expect(looked()).toBe(false);
    expect(sent).toEqual([]);
    expect(logs.some((l) => l.includes("couldn't pass it on"))).toBe(true);
  });
});

describe("passOnRelay: old notes and lapsed asks are cleared (Step 41.5)", () => {
  it("deletes notes older than a day and asks pending for 30 days, before noting this one", async () => {
    await passOnRelay(ASK);
    const [notes] = ops(NOTES, "delete");
    expect(notes.steps).toEqual([["delete"], ["lt", "created_at", ago(DAY)]]);
    const [lapsed] = ops(RELAYS, "delete");
    expect(lapsed.steps).toEqual([
      ["delete"],
      ["eq", "status", "pending"],
      ["lte", "created_at", ago(30 * DAY)],
    ]);
    expect(chains.indexOf(notes)).toBeLessThan(chains.indexOf(ops(NOTES, "insert")[0]));
    expect(chains.indexOf(lapsed)).toBeLessThan(chains.indexOf(ops(NOTES, "insert")[0]));
  });

  it("still passes the ask on when clearing fails, and logs no name or address", async () => {
    reply = (chain) =>
      first(chain) === "delete" && !hasEq(chain, "id")
        ? { error: { code: "57014", message: "canceling statement" } }
        : defaultReply(chain);
    await passOnRelay(ASK);
    expect(sent).toHaveLength(1);
    expect(logs).toContain(
      "[invite-relays] ask to a relative: couldn't clear old asks — 57014 canceling statement",
    );
  });
});

describe("passOnRelay: an ask for a member (Step 30.5)", () => {
  it("files nothing and emails nobody when no member who lets relatives ask has the address", async () => {
    // A member who has turned asks off is found by nobody (`invite_relay_recipient`).
    lookup = { data: [] };
    await passOnRelay(ASK);
    expect(on("rpc:invite_relay_recipient")).toEqual([
      { table: "rpc:invite_relay_recipient", steps: [["args", { p_email: "amina@example.com" }]] },
    ]);
    expect(ops(RELAYS, "insert")).toEqual([]);
    expect(ops(RELAYS, "update")).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("files the ask for the member and emails them a button to it", async () => {
    await passOnRelay(ASK);

    const [insert] = ops(RELAYS, "insert");
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

    const [update] = ops(RELAYS, "update");
    expect(update.steps).toEqual([
      ["update", { email_sent: true }],
      ["eq", "id", RELAY],
    ]);
    expect(takenBack(RELAYS)).toEqual([]);
    expect(takenBack(NOTES)).toEqual([]);
  });

  it("counts the asks filed for the member over the last week", async () => {
    await passOnRelay(ASK);
    const [toRecipient] = ops(RELAYS, "select");
    expect(toRecipient.steps).toContainEqual(["eq", "recipient_user_id", MEMBER.user_id]);
    expect(toRecipient.steps).toContainEqual(["gte", "created_at", ago(7 * DAY)]);
    expect(toRecipient.steps).toContainEqual(["limit", 6]);
  });

  it("emails nobody when the same address asked them already", async () => {
    reply = (chain) =>
      chain.table === RELAYS && first(chain) === "insert"
        ? { error: { code: "23505" } }
        : defaultReply(chain);
    await passOnRelay(ASK);
    expect(sent).toEqual([]);
    expect(ops(RELAYS, "select")).toEqual([]);
    expect(takenBack(RELAYS)).toEqual([]);
    // It was asked all the same, so its note still counts.
    expect(takenBack(NOTES)).toEqual([]);
  });

  it("drops an ask past the member's cap, keeping no row of it", async () => {
    reply = (chain) =>
      chain.table === RELAYS && first(chain) === "select"
        ? { data: [...justNow(), ...recent(2)] }
        : defaultReply(chain);
    await passOnRelay(ASK);

    expect(sent).toEqual([]);
    const [drop] = takenBack(RELAYS);
    expect(drop.steps).toEqual([["delete"], ["eq", "id", RELAY]]);
    expect(logs).toContain("[invite-relays] ask to a relative: over the member's cap, so dropped");
  });

  it("doesn't pass an ask on when it can't count the member's asks", async () => {
    reply = (chain) =>
      chain.table === RELAYS && first(chain) === "select"
        ? { error: { code: "57014", message: "canceling statement" } }
        : defaultReply(chain);
    await passOnRelay(ASK);
    expect(sent).toEqual([]);
    expect(takenBack(RELAYS)).toHaveLength(1);
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
    const [update] = ops(RELAYS, "update");
    expect(update.steps[0]).toEqual(["update", { email_sent: false }]);
  });

  it("never logs a name or an address", async () => {
    sendResult = { ok: false, error: "Resend 422: amina@example.com is not allowed" };
    await passOnRelay(ASK);
    reply = (chain) =>
      chain.table === RELAYS && first(chain) === "insert"
        ? { error: { code: "23514", message: "violates check constraint" } }
        : defaultReply(chain);
    await passOnRelay(ASK);
    reply = (chain) =>
      chain.table === NOTES && first(chain) === "select"
        ? { data: [...justNow(), ...recent(40, 1)] }
        : defaultReply(chain);
    await passOnRelay(ASK);
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toMatch(/zahra|amina|suleman/i);
    }
  });
});
