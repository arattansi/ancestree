import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { cardLinkHash, cardLinkToken, newCardLink, shownAgain } from "@/lib/card-link-key.server";
import { isCardLinkToken } from "@/lib/card-links";

const ID = "6f1c2a4e-9b3d-4c8e-a1f0-2d7e5b9c3a10";

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";
});

describe("a card link's token (Step 229)", () => {
  it("is the same for a link each time, in the shape /c/<token> takes", () => {
    expect(cardLinkToken(ID)).toBe(cardLinkToken(ID));
    expect(isCardLinkToken(cardLinkToken(ID))).toBe(true);
  });

  it("differs by link and by the server's secret", () => {
    const token = cardLinkToken(ID);
    expect(cardLinkToken("6f1c2a4e-9b3d-4c8e-a1f0-2d7e5b9c3a11")).not.toBe(token);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "another-secret";
    expect(cardLinkToken(ID)).not.toBe(token);
  });

  it("is kept as the hash the database works out: sha256, lower-case hex", () => {
    // encode(extensions.digest('abc', 'sha256'), 'hex') in Postgres.
    expect(cardLinkHash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(cardLinkHash(cardLinkToken(ID))).toMatch(/^[0-9a-f]{64}$/);
  });

  it("makes a new link whose token is its id's and whose hash is its token's", () => {
    const one = newCardLink();
    const two = newCardLink();
    expect(one.id).not.toBe(two.id);
    expect(one.token).toBe(cardLinkToken(one.id));
    expect(one.hash).toBe(cardLinkHash(one.token));
  });
});

describe("a live link shown again", () => {
  it("is worked out from the row the database answers", () => {
    const made = newCardLink();
    expect(shownAgain({ id: made.id, hash: made.hash })).toEqual({ id: made.id, token: made.token });
  });

  it("isn't for a link made before Step 229, from random bytes", () => {
    const random = createHash("sha256").update("AbCdEfGhIjKlMnOpQrStUvWx").digest("hex");
    expect(shownAgain({ id: ID, hash: random })).toBeNull();
  });

  it("isn't once the server's secret has changed", () => {
    const made = newCardLink();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "rotated";
    expect(shownAgain({ id: made.id, hash: made.hash })).toBeNull();
  });

  it("is nothing for anything else", () => {
    const made = newCardLink();
    expect(shownAgain(null)).toBeNull();
    expect(shownAgain("x")).toBeNull();
    expect(shownAgain({ id: made.id })).toBeNull();
    expect(shownAgain({ id: "not-a-uuid", hash: made.hash })).toBeNull();
    expect(shownAgain({ id: made.id, hash: made.hash.toUpperCase() })).toBeNull();
    expect(shownAgain({ id: made.id, hash: made.hash.slice(1) })).toBeNull();
  });
});
