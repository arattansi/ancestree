import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The two ways of asking whose land a place is — app/api/ancestral-lands for
// the signed-in, and a share link's app/shared/[token]/ancestral-lands — with
// their dependencies stubbed: who's asking, what the link shows, the `places`
// row, and Native Land Digital itself.
const getProfile = vi.fn();
const sharedTreeShowsPlace = vi.fn();
const territoriesAt = vi.fn();
let placeRow: Record<string, unknown> | null = null;

const placesTable = () => ({
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: placeRow }) }),
    }),
  }),
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getProfile: () => getProfile() }));
vi.mock("@/lib/share-links.server", () => ({
  sharedTreeShowsPlace: (token: string, placeId: number) =>
    sharedTreeShowsPlace(token, placeId),
}));
vi.mock("@/lib/native-land.server", () => ({
  territoriesAt: (lat: number, lng: number) => territoriesAt(lat, lng),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => placesTable() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => placesTable() }));

import { GET } from "@/app/api/ancestral-lands/route";
import { GET as GET_SHARED } from "@/app/shared/[token]/ancestral-lands/route";

const ask = (query: string) =>
  GET(new NextRequest(`http://localhost/api/ancestral-lands${query}`));

const askShared = (token: string, query: string) =>
  GET_SHARED(
    new NextRequest(`http://localhost/shared/${token}/ancestral-lands${query}`),
    { params: Promise.resolve({ token }) },
  );

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

describe("GET /shared/<token>/ancestral-lands", () => {
  beforeEach(() => {
    getProfile.mockReset().mockResolvedValue(null);
    sharedTreeShowsPlace.mockReset().mockResolvedValue(true);
    territoriesAt.mockReset();
    placeRow = TORONTO;
  });

  it("answers a share link's viewer, who isn't signed in, uncached", async () => {
    territoriesAt.mockResolvedValue([{ name: "Mississauga", url: null }]);
    const res = await askShared("tok123", "?place=6167865");

    expect(sharedTreeShowsPlace).toHaveBeenCalledWith("tok123", 6167865);
    expect(territoriesAt).toHaveBeenCalledWith(43.70011, -79.4163);
    expect(getProfile).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      territories: [{ name: "Mississauga", url: null }],
      available: true,
    });
  });

  it("asks nothing about a place the link doesn't show, or for a dead link", async () => {
    sharedTreeShowsPlace.mockResolvedValue(false);
    const res = await askShared("tok123", "?place=6167865");
    expect(res.status).toBe(404);
    expect(territoriesAt).not.toHaveBeenCalled();
  });

  it("wants a place id before looking at the link", async () => {
    expect((await askShared("tok123", "")).status).toBe(400);
    expect((await askShared("tok123", "?place=1.5")).status).toBe(400);
    expect(sharedTreeShowsPlace).not.toHaveBeenCalled();
  });

  it("says NLD couldn't be asked about a place without coordinates", async () => {
    placeRow = { latitude: null, longitude: null, feature_class: "P" };
    expect(await (await askShared("tok123", "?place=10000000001")).json()).toEqual({
      territories: [],
      available: false,
    });
    expect(territoriesAt).not.toHaveBeenCalled();
  });
});
