import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SendEmailInput, SendEmailResult } from "@/lib/email";

// `mintInvites` with the service-role client and the mailer stubbed. Each
// query records its chain of calls and, when awaited, answers from `reply`.
type Step = [method: string, ...args: unknown[]];
type Chain = { table: string; steps: Step[] };
type Reply = { data?: unknown; error?: { message: string } | null };

let reply: (chain: Chain) => Reply;
let chains: Chain[];
let batches: SendEmailInput[][];
let answers: (messages: SendEmailInput[]) => SendEmailResult[];

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
  createAdminClient: () => ({ from: (table: string) => query(table) }),
}));
vi.mock("@/lib/site-url", () => ({ getSiteUrl: () => "https://www.ancestree.space" }));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmails: async (messages: SendEmailInput[]) => {
    batches.push(messages);
    return answers(messages);
  },
}));

import type { Profile } from "@/lib/auth";
import { mintInvites, type InviteEmail } from "@/lib/invite-mint.server";

const TREE = "7a1b2c3d-0000-4000-8000-000000000077";
const INVITER = {
  auth_user_id: "0b9e1c2d-0000-4000-8000-000000000001",
  display_name: "Amina",
} as Profile;
const ZAHRA = { firstName: "Zahra", lastName: "Suleman", email: "zahra@example.com" };
const OMAR = { firstName: "Omar", lastName: "Suleman", email: "omar@example.com" };

const email: InviteEmail = (recipient, { url, inviterName }) => ({
  subject: `${inviterName} invited ${recipient.firstName}`,
  html: url,
});
const rowsOf = (chain: Chain) => chain.steps[0][1] as Record<string, unknown>[];
const inserted = (table: string) => chains.find((c) => c.table === table);

beforeEach(() => {
  chains = [];
  batches = [];
  answers = (messages) => messages.map(() => ({ ok: true }));
  // Handed back in another order than asked, as nothing promises it.
  reply = (chain) =>
    chain.table === "invites"
      ? {
          data: [
            { id: "inv-omar", token: "tok-omar", invited_email: OMAR.email },
            { id: "inv-zahra", token: "tok-zahra", invited_email: ZAHRA.email },
          ],
        }
      : {};
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("mintInvites", () => {
  it("makes, emails and files them together, each its own link", async () => {
    answers = () => [{ ok: true }, { ok: false, status: 422, error: "Resend 422: …" }];
    const minted = await mintInvites({
      treeId: TREE,
      inviter: INVITER,
      recipients: [ZAHRA, OMAR],
      source: "direct",
      email,
    });

    expect(chains.map((c) => c.table)).toEqual(["invites", "invite_requests"]);
    expect(rowsOf(inserted("invites")!)).toEqual([
      expect.objectContaining({
        tree_id: TREE,
        created_by: INVITER.auth_user_id,
        status: "active",
        joins_as: "member",
        founds_tree: false,
        person_id: null,
        invited_email: ZAHRA.email,
      }),
      expect.objectContaining({ invited_email: OMAR.email }),
    ]);

    expect(batches).toEqual([
      [
        {
          to: ZAHRA.email,
          subject: "Amina invited Zahra",
          html: "https://www.ancestree.space/join/tok-zahra",
        },
        {
          to: OMAR.email,
          subject: "Amina invited Omar",
          html: "https://www.ancestree.space/join/tok-omar",
        },
      ],
    ]);

    expect(rowsOf(inserted("invite_requests")!)).toEqual([
      expect.objectContaining({
        tree_id: TREE,
        first_name: "Zahra",
        last_name: "Suleman",
        email: ZAHRA.email,
        source: "direct",
        status: "approved",
        reviewed_by: INVITER.auth_user_id,
        invite_id: "inv-zahra",
        email_sent: true,
      }),
      expect.objectContaining({ invite_id: "inv-omar", email_sent: false }),
    ]);

    expect(minted).toEqual([
      {
        email: ZAHRA.email,
        inviteId: "inv-zahra",
        url: "https://www.ancestree.space/join/tok-zahra",
        emailed: true,
        error: undefined,
      },
      {
        email: OMAR.email,
        inviteId: "inv-omar",
        url: "https://www.ancestree.space/join/tok-omar",
        emailed: false,
        error: "the address was refused",
      },
    ]);
  });

  it("sends and files nothing when the invites can't be made", async () => {
    reply = (chain) => (chain.table === "invites" ? { error: { message: "down" } } : {});
    const minted = await mintInvites({
      treeId: TREE,
      inviter: INVITER,
      recipients: [ZAHRA, OMAR],
      source: "direct",
      email,
    });
    expect(minted.map((m) => [m.inviteId, m.emailed, m.error])).toEqual([
      [null, false, "Could not create a link."],
      [null, false, "Could not create a link."],
    ]);
    expect(batches).toEqual([]);
    expect(chains.map((c) => c.table)).toEqual(["invites"]);
  });

  it("keeps the invites when their record can't be filed", async () => {
    reply = (chain) =>
      chain.table === "invites"
        ? { data: [{ id: "inv-zahra", token: "tok-zahra", invited_email: ZAHRA.email }] }
        : { error: { message: "down" } };
    const [minted] = await mintInvites({
      treeId: TREE,
      inviter: INVITER,
      recipients: [ZAHRA],
      source: "direct",
      email,
    });
    expect(minted).toMatchObject({ inviteId: "inv-zahra", emailed: true });
  });

  it("marks a founder invite, and an entry's", async () => {
    await mintInvites({
      treeId: TREE,
      inviter: INVITER,
      recipients: [ZAHRA],
      foundsTree: true,
      source: "request",
      email,
    });
    expect(rowsOf(chains[0])[0]).toMatchObject({ founds_tree: true, person_id: null });
    expect(rowsOf(chains[1])[0]).toMatchObject({ source: "request" });

    chains = [];
    await mintInvites({
      treeId: TREE,
      inviter: INVITER,
      recipients: [ZAHRA],
      personId: "5e0d1a2b-0000-4000-8000-000000000005",
      source: "direct",
      email,
    });
    expect(rowsOf(chains[0])[0]).toMatchObject({
      founds_tree: false,
      person_id: "5e0d1a2b-0000-4000-8000-000000000005",
    });
  });

  it("names an inviter with no name as a family member", async () => {
    await mintInvites({
      treeId: TREE,
      inviter: { ...INVITER, display_name: null },
      recipients: [ZAHRA],
      source: "direct",
      email,
    });
    expect(batches[0][0].subject).toBe("A family member invited Zahra");
  });
});
