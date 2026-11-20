import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { mayTryAgain } from "@/lib/card-last-calls.server";

describe("mayTryAgain", () => {
  it("tries again only when Resend answered no for a reason that may pass", () => {
    expect(mayTryAgain({ ok: true })).toBe(false);
    expect(mayTryAgain({ ok: false, status: 429, error: "Resend 429" })).toBe(true);
    expect(mayTryAgain({ ok: false, status: 500, error: "Resend 500" })).toBe(true);
    // The address was refused: it won't take it next time either.
    expect(mayTryAgain({ ok: false, status: 422, error: "Resend 422" })).toBe(false);
    // Never answered: it may have gone.
    expect(mayTryAgain({ ok: false, error: "Resend did not respond in time" })).toBe(false);
    expect(mayTryAgain(undefined)).toBe(false);
  });
});
