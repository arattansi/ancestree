import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SendEmailInput, SendEmailResult } from "@/lib/email";

// The two senders with the service-role client and the mailer stubbed.
type Reply = { data?: unknown; error?: { message: string } | null };

let calls: { fn: string; args: unknown }[];
let reply: (fn: string) => Reply;
let batches: SendEmailInput[][];
let answers: (messages: SendEmailInput[]) => SendEmailResult[];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      const answer = reply(fn);
      return { data: answer.data ?? null, error: answer.error ?? null };
    },
  }),
}));
vi.mock("@/lib/site-url", () => ({ getSiteUrl: () => "https://www.ancestree.space" }));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmails: async (messages: SendEmailInput[]) => {
    batches.push(messages);
    return answers(messages);
  },
}));

import {
  alertPlacementAsks,
  sendPlacementNudges,
} from "@/lib/placement-alerts.server";

const TREE = "7a1b2c3d-0000-4000-8000-000000000083";
const OWNER = {
  email: "daniel@example.com",
  kind: "owner",
  person_name: "Daniel Hassan",
  entries: 1,
  home_tree_name: "The Hassan Family",
};
const STEWARD = {
  email: "karim@example.com",
  kind: "steward",
  person_name: null,
  entries: 2,
  home_tree_name: "The Hassan Family",
};

beforeEach(() => {
  calls = [];
  batches = [];
  reply = () => ({ data: [] });
  answers = (messages) => messages.map(() => ({ ok: true }));
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("alertPlacementAsks (Step 80)", () => {
  it("emails everyone asked, in one batch", async () => {
    reply = () => ({ data: [OWNER, STEWARD] });
    await alertPlacementAsks({
      treeId: TREE,
      treeName: "The Moreno Family",
      placerName: "Sofia Hassan",
      personIds: ["p1", "p2", "p3"],
    });
    expect(calls).toEqual([
      {
        fn: "placement_ask_recipients",
        args: { p_tree: TREE, p_person_ids: ["p1", "p2", "p3"] },
      },
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0].map((m) => [m.to, m.subject])).toEqual([
      [
        "daniel@example.com",
        "Sofia Hassan would like to show your full entry on The Moreno Family",
      ],
      [
        "karim@example.com",
        "Sofia Hassan would like to show 2 full entries from The Hassan Family on The Moreno Family",
      ],
    ]);
  });

  it("asks the database nothing when nobody was asked", async () => {
    await alertPlacementAsks({
      treeId: TREE,
      treeName: "The Moreno Family",
      placerName: "Sofia Hassan",
      personIds: [],
    });
    expect(calls).toEqual([]);
    expect(batches).toEqual([]);
  });
});

describe("sendPlacementNudges (Step 83)", () => {
  const due = (row: typeof OWNER | typeof STEWARD) => ({
    ...row,
    placer_name: "Sofia Hassan",
    tree_name: "The Moreno Family",
  });

  it("emails each reminder the database hands out, saying it's a reminder", async () => {
    reply = () => ({ data: [due(OWNER), due(STEWARD)] });
    await sendPlacementNudges(TREE);
    expect(calls).toEqual([
      { fn: "run_placement_nudges", args: { p_tree: TREE } },
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0].map((m) => [m.to, m.subject])).toEqual([
      [
        "daniel@example.com",
        "Reminder: Sofia Hassan would like to show your full entry on The Moreno Family",
      ],
      [
        "karim@example.com",
        "Reminder: Sofia Hassan would like to show 2 full entries from The Hassan Family on The Moreno Family",
      ],
    ]);
    expect(batches[0][0].html).toContain(
      'href="https://www.ancestree.space/account?view=settings#asked-of-you"',
    );
  });

  it("sends nothing when only a lapse was noted", async () => {
    reply = () => ({ data: [] });
    await sendPlacementNudges(TREE);
    expect(calls).toHaveLength(1);
    expect(batches).toEqual([]);
  });

  it("swallows a refusal, so the page that set it off is unharmed", async () => {
    reply = () => ({ error: { message: "permission denied" } });
    await expect(sendPlacementNudges(TREE)).resolves.toBeUndefined();
    expect(batches).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  it("logs how the mailer answered, never its words", async () => {
    reply = () => ({ data: [due(OWNER)] });
    answers = (messages) =>
      messages.map(() => ({
        ok: false,
        status: 422,
        error: "Resend 422: daniel@example.com is not valid",
      }));
    await sendPlacementNudges(TREE);
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toContain("Resend 422");
    expect(logged).not.toContain("daniel@example.com");
  });
});
