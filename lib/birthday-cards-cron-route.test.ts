import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// app/api/cron/birthday-cards with its dependencies stubbed: the database's
// answers, the pushes and emails it would send. Step 224: the nudges to
// start a card go to the phones of those whose cards switch is on.
type Row = Record<string, unknown>;
let answers: Record<string, Row[]> = {};
const rpc = vi.fn(async (name: string) => ({ data: answers[name] ?? [], error: null }));
const sendPushes = vi.fn(async (pushes: readonly unknown[]) => ({ sent: pushes.length }));
const sendEmails = vi.fn(async () => []);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc, storage: { from: () => ({ remove: async () => ({ error: null }) }) } }),
}));
vi.mock("@/lib/push.server", () => ({ sendPushes: (p: readonly unknown[]) => sendPushes(p) }));
vi.mock("@/lib/email", () => ({ sendEmails: () => sendEmails(), escapeHtml: (s: string) => s }));
vi.mock("@/lib/birthday-cards.server", () => ({
  sendCardThanks: async () => ({ pushed: 0, emailed: 0 }),
}));

import { GET } from "@/app/api/cron/birthday-cards/route";

const run = () =>
  GET(
    new NextRequest("http://localhost/api/cron/birthday-cards", {
      headers: { authorization: "Bearer test-secret" },
    }),
  );

describe("GET /api/cron/birthday-cards: nudges (Step 224)", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    rpc.mockClear();
    sendPushes.mockClear();
    answers = {
      send_card_nudges: [
        {
          user_id: "u-root",
          person_id: "p-ada",
          tree_id: "t1",
          body: "Ada's birthday is on 1 December. Start a card for the family to sign?",
          kind: "open",
          first_name: "Ada",
          push: true,
        },
        {
          user_id: "u-spouse",
          person_id: "p-ada",
          tree_id: "t1",
          body: "Ada's birthday is on 1 December. Start a card for the family to sign?",
          kind: "open",
          first_name: "Ada",
          push: false,
        },
      ],
    };
  });

  it("pushes each nudge to those whose phones may be told, in the notice's words", async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ nudged: 2, pushed: 1 });
    expect(sendPushes).toHaveBeenCalledWith([
      {
        userId: "u-root",
        note: {
          title: "Ada’s birthday card",
          body: "Ada's birthday is on 1 December. Start a card for the family to sign?",
          data: { kind: "card", personId: "p-ada", open: false },
          channelId: "cards",
        },
      },
    ]);
  });

  it("sends nothing without the job's secret", async () => {
    vi.stubEnv("CRON_SECRET", "another");
    const res = await run();
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(sendPushes).not.toHaveBeenCalled();
  });
});
