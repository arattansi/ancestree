import { describe, expect, it } from "vitest";

import {
  keepSignedUrl,
  RESIGN_WITHIN_MS,
  signedUrlExpiry,
} from "@/lib/signed-url";

const BASE =
  "https://abc.supabase.co/storage/v1/object/sign/photos/u1/people/p1/a.jpg";

function b64url(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** A URL signed the way storage signs one, expiring at `exp` (seconds). */
function signed(exp: number, base = BASE, extra = {}) {
  const token = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ url: "photos/a.jpg", iat: exp - 3600, exp, ...extra })}.sig`;
  return `${base}?token=${token}`;
}

const NOW = 1_800_000_000_000;
const inS = (ms: number) => Math.floor((NOW + ms) / 1000);

describe("photo addresses kept across saves (Step 87.1)", () => {
  it("reads when a signed address stops working", () => {
    expect(signedUrlExpiry(signed(1_800_003_600))).toBe(1_800_003_600_000);
  });

  it("has no expiry for an address it can't read one from", () => {
    for (const url of [
      BASE,
      `${BASE}?t=1`,
      `${BASE}?token=`,
      `${BASE}?token=abc`,
      `${BASE}?token=a.%%%.c`,
      `${BASE}?token=a.${b64url({ exp: "soon" })}.c`,
      "/zz/0.jpg",
    ]) {
      expect(signedUrlExpiry(url)).toBeNull();
    }
  });

  it("reuses the first address for a photo while it has long to run", () => {
    const kept = new Map<string, string>();
    const first = signed(inS(60 * 60 * 1000));
    expect(keepSignedUrl(kept, first, NOW)).toBe(first);
    const again = signed(inS(60 * 60 * 1000 + 5000), BASE, { n: 2 });
    expect(keepSignedUrl(kept, again, NOW + 5000)).toBe(first);
  });

  it("takes the new address once the kept one is close to running out", () => {
    const kept = new Map<string, string>();
    const first = signed(inS(RESIGN_WITHIN_MS + 60_000));
    keepSignedUrl(kept, first, NOW);
    const later = NOW + 61_000;
    const fresh = signed(Math.floor(later / 1000) + 3600);
    expect(keepSignedUrl(kept, fresh, later)).toBe(fresh);
    // …and keeps that one from then on.
    const third = signed(Math.floor(later / 1000) + 3601, BASE, { n: 3 });
    expect(keepSignedUrl(kept, third, later + 1000)).toBe(fresh);
  });

  it("keeps each photo apart by its address without the query", () => {
    const kept = new Map<string, string>();
    const other = BASE.replace("a.jpg", "b.jpg");
    const a = signed(inS(3_600_000));
    const b = signed(inS(3_600_000), other);
    expect(keepSignedUrl(kept, a, NOW)).toBe(a);
    expect(keepSignedUrl(kept, b, NOW)).toBe(b);
    expect(kept.size).toBe(2);
  });

  it("shows an address without a readable expiry as it comes", () => {
    const kept = new Map<string, string>();
    expect(keepSignedUrl(kept, BASE, NOW)).toBe(BASE);
    expect(keepSignedUrl(kept, `${BASE}?t=1`, NOW)).toBe(`${BASE}?t=1`);
    expect(keepSignedUrl(kept, `${BASE}?t=2`, NOW)).toBe(`${BASE}?t=2`);
    expect(kept.size).toBe(0);
  });

  it("keeps a photo's card-sized copies apart from it and from each other (Step 87.5)", () => {
    const kept = new Map<string, string>();
    const render = BASE.replace("/object/sign/", "/render/image/sign/");
    const full = signed(inS(3_600_000));
    const card = (edge: number, n: number) =>
      signed(inS(3_600_000), render, {
        transformations: `height:${edge},width:${edge},resize:contain`,
        n,
      });
    const small = card(128, 1);
    expect(keepSignedUrl(kept, full, NOW)).toBe(full);
    expect(keepSignedUrl(kept, small, NOW)).toBe(small);
    // The same size signed again is the kept one…
    expect(keepSignedUrl(kept, card(128, 2), NOW + 1000)).toBe(small);
    // …a new size (the crop zoomed in) is shown at once.
    const larger = card(256, 3);
    expect(keepSignedUrl(kept, larger, NOW + 2000)).toBe(larger);
    // A same-path address with no transform is still the full photo.
    expect(keepSignedUrl(kept, signed(inS(3_600_000), render), NOW)).not.toBe(small);
  });
});
