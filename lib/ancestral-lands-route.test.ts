import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The route in app/api/ancestral-lands, with its three dependencies stubbed:
// who's asking, the `places` row, and Native Land Digital itself.
const getProfile = vi.fn();
const territoriesAt = vi.fn();
let placeRow: Record<string, unknown> | null = null;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getProfile: () => getProfile() }));
vi.mock("@/lib/native-land.server", () => ({
  territoriesAt: (lat: number, lng: number) => territoriesAt(lat, lng),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: placeRow }) }),
      }),
    }),
  }),
}));

import { GET } from "@/app/api/ancestral-lands/route";

const ask = (query: string) =>
  GET(new NextRequest(`http://localhost/api/ancestral-lands${query}`));

const TORONTO = { latitude: 43.70011, longitude: -79.4163, feature_class: "P" };

describe("GET /api/ancestral-lands", () => {
  beforeEach(() => {
    getProfile.mockReset().mockResolvedValue({ auth_user_id: "u1" });
    territoriesAt.mockReset();
    placeRow = TORONTO;
  });

  it("answers members only", async () => {
    getProfile.mockResolvedValue(null);
    const res = await ask("?place=6167865");
    expect(res.status).toBe(401);
    expect(territoriesAt).not.toHaveBeenCalled();
  });

  it("wants a place id", async () => {
    expect((await ask("")).status).toBe(400);
    expect((await ask("?place=toronto")).status).toBe(400);
    expect((await ask("?place=-3")).status).toBe(400);
  });

  it("names the territories at the place, uncached", async () => {
    territoriesAt.mockResolvedValue([{ name: "Mississauga", url: null }]);
    const res = await ask("?place=6167865");

    expect(territoriesAt).toHaveBeenCalledWith(43.70011, -79.4163);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      territories: [{ name: "Mississauga", url: null }],
      available: true,
    });
  });

  it("says NLD couldn't be asked when there's no key or no answer", async () => {
    territoriesAt.mockResolvedValue(null);
    expect(await (await ask("?place=6167865")).json()).toEqual({
      territories: [],
      available: false,
    });
  });

  it("doesn't ask about a place without coordinates, or one it doesn't know", async () => {
    placeRow = { latitude: null, longitude: null, feature_class: "P" };
    expect((await (await ask("?place=10000000001")).json()).available).toBe(false);
    placeRow = null;
    expect((await (await ask("?place=42")).json()).available).toBe(false);
    expect(territoriesAt).not.toHaveBeenCalled();
  });
});
