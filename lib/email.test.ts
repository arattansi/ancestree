import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  sendEmail,
  sendEmails,
  unsentSummary,
  whyNotSent,
  type SendEmailInput,
} from "@/lib/email";

// Resend stubbed: each request is recorded and answered by `answer`.
type Call = { url: string; body: unknown };
let calls: Call[];
let answer: (call: Call) => Response;

const BATCH_URL = "https://api.resend.com/emails/batch";
const ONE_URL = "https://api.resend.com/emails";
const mail = (to: string): SendEmailInput => ({ to, subject: "Hi", html: "<p>Hi</p>" });
const toOf = (call: Call) => (call.body as { to: string }).to;
const status = (code: number, headers?: Record<string, string>) =>
  new Response(JSON.stringify({ statusCode: code, message: "no" }), { status: code, headers });

beforeEach(() => {
  calls = [];
  answer = () => new Response(JSON.stringify({ data: [] }), { status: 200 });
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const call = { url, body: JSON.parse(String(init.body)) };
      calls.push(call);
      return answer(call);
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("sendEmails", () => {
  it("sends several in one batch, each to its own address", async () => {
    const results = await sendEmails([mail("a@x.com"), mail("b@x.com"), mail("c@x.com")]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(BATCH_URL);
    expect((calls[0].body as { to: string }[]).map((m) => m.to)).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
    ]);
  });

  it("carries a message's own headers, and none when it has none (Step 95)", async () => {
    const unsubscribe = {
      "List-Unsubscribe": "<https://www.ancestree.space/api/newsletter/t>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
    await sendEmails([{ ...mail("a@x.com"), headers: unsubscribe }, mail("b@x.com")]);
    const [withHeaders, without] = calls[0].body as { headers?: unknown }[];
    expect(withHeaders.headers).toEqual(unsubscribe);
    expect(without).not.toHaveProperty("headers");
  });

  it("sends one on its own, and nothing for nobody", async () => {
    expect(await sendEmails([mail("a@x.com")])).toEqual([{ ok: true }]);
    expect(calls.map((c) => c.url)).toEqual([ONE_URL]);
    expect(await sendEmails([])).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("sends a refused batch again one by one, each answering for itself", async () => {
    answer = (call) =>
      Array.isArray(call.body) || toOf(call) === "bad@x.com" ? status(422) : status(200);
    const results = await sendEmails([mail("a@x.com"), mail("bad@x.com"), mail("c@x.com")]);
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(whyNotSent(results[1])).toBe("the address was refused");
    expect(calls.map((c) => (c.url === BATCH_URL ? "batch" : toOf(c)))).toEqual([
      "batch",
      "a@x.com",
      "bad@x.com",
      "c@x.com",
    ]);
  });

  it("doesn't send a batch again when the fault isn't in what it says", async () => {
    answer = () => status(500);
    const results = await sendEmails([mail("a@x.com"), mail("b@x.com")]);
    expect(results).toEqual([
      expect.objectContaining({ ok: false, status: 500 }),
      expect.objectContaining({ ok: false, status: 500 }),
    ]);
    expect(calls).toHaveLength(1);
  });

  it("doesn't send again when Resend couldn't be reached: they may have gone", async () => {
    answer = () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    };
    const results = await sendEmails([mail("a@x.com"), mail("b@x.com")]);
    expect(results).toEqual([
      { ok: false, error: "Resend did not respond in time" },
      { ok: false, error: "Resend did not respond in time" },
    ]);
    expect(calls).toHaveLength(1);
  });

  it("asked too fast, waits as long as Resend says and asks once more", async () => {
    vi.useFakeTimers();
    let asked = 0;
    answer = () => (asked++ === 0 ? status(429, { "retry-after": "1" }) : status(200));
    const pending = sendEmails([mail("a@x.com"), mail("b@x.com")]);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual([{ ok: true }, { ok: true }]);
    expect(calls.map((c) => c.url)).toEqual([BATCH_URL, BATCH_URL]);
  });

  it("asks only once more, however long Resend says to wait", async () => {
    vi.useFakeTimers();
    answer = () => status(429, { "retry-after": "60" });
    const pending = sendEmail(mail("a@x.com"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toEqual(expect.objectContaining({ ok: false, status: 429 }));
    expect(calls).toHaveLength(2);
  });

  it("sends over a hundred in batches of a hundred", async () => {
    const many = Array.from({ length: 150 }, (_, i) => mail(`p${i}@x.com`));
    const results = await sendEmails(many);
    expect(results).toHaveLength(150);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(calls.map((c) => (c.body as unknown[]).length)).toEqual([100, 50]);
  });

  it("sends nothing without an API key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const results = await sendEmails([mail("a@x.com"), mail("b@x.com")]);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe("whyNotSent", () => {
  it("says an address was refused, and nothing else", () => {
    expect(whyNotSent({ ok: true })).toBeUndefined();
    expect(whyNotSent({ ok: false, status: 422, error: "Resend 422: a@x.com" })).toBe(
      "the address was refused",
    );
    expect(whyNotSent({ ok: false, status: 500, error: "Resend 500: …" })).toBeUndefined();
    expect(whyNotSent({ ok: false, error: "Resend did not respond in time" })).toBeUndefined();
  });
});

describe("unsentSummary", () => {
  it("says how many didn't send and how Resend answered, never its words", () => {
    expect(unsentSummary([{ ok: true }])).toBeNull();
    expect(
      unsentSummary([
        { ok: true },
        { ok: false, status: 422, error: "Resend 422: bad@x.com is invalid" },
        { ok: false, status: 500, error: "Resend 500: …" },
      ]),
    ).toBe("2 of 3 didn't send — Resend 422");
    expect(unsentSummary([{ ok: false, error: "Resend did not respond in time" }])).toBe(
      "1 of 1 didn't send — Resend did not respond in time",
    );
  });
});
