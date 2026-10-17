import { describe, expect, it } from "vitest";

import { keyId, newKeyPair, type PublicKey } from "@/lib/e2e/crypto";
import { checkPin } from "@/lib/e2e/pins";

const NADIA = "nadia";
const publicOf = (version: number): PublicKey => {
  const k = newKeyPair();
  return { version, boxPublic: k.boxPublic, signPublic: k.signPublic };
};

describe("pinning members' keys", () => {
  it("pins a key the first time and accepts it again", () => {
    const key = publicOf(1);
    const first = checkPin({}, NADIA, key);
    expect(first).toEqual({ ok: true, pins: { [NADIA]: { 1: keyId(key) } } });
    expect(checkPin(first.pins, NADIA, key).ok).toBe(true);
  });

  it("refuses another key under a version it has pinned", () => {
    const first = checkPin({}, NADIA, publicOf(1));
    const swapped = checkPin(first.pins, NADIA, publicOf(1));
    expect(swapped).toMatchObject({ ok: false, reason: "swapped" });
    expect(swapped.pins).toBe(first.pins);
  });

  it("takes a new version: someone starting over", () => {
    const first = checkPin({}, NADIA, publicOf(1));
    const next = checkPin(first.pins, NADIA, publicOf(2));
    expect(next.ok).toBe(true);
    expect(Object.keys(next.pins[NADIA])).toEqual(["1", "2"]);
  });

  it("refuses a key that isn't one", () => {
    const zeros = { version: 1, boxPublic: new Uint8Array(32), signPublic: new Uint8Array(32) };
    expect(checkPin({}, NADIA, zeros)).toMatchObject({ ok: false, reason: "invalid" });
    // The Ed25519 identity point: small order, refused under RFC 8032.
    const identity = new Uint8Array(32);
    identity[0] = 1;
    const k = newKeyPair();
    expect(
      checkPin({}, NADIA, { version: 1, boxPublic: k.boxPublic, signPublic: identity }),
    ).toMatchObject({ ok: false, reason: "invalid" });
  });
});
