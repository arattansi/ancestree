import { beforeEach, describe, expect, it, vi } from "vitest";

// moveClaimedPhoto with the service-role client stubbed: its storage `move`
// records what it was asked and answers with `moveError`.
let moves: { bucket: string; from: string; to: string }[];
let moveError: { message: string } | null;
let moveThrows: boolean;
let adminCreated: number;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    adminCreated += 1;
    return {
      storage: {
        from: (bucket: string) => ({
          move: async (from: string, to: string) => {
            if (moveThrows) throw new Error("fetch failed");
            moves.push({ bucket, from, to });
            return { data: moveError ? null : { message: "ok" }, error: moveError };
          },
        }),
      },
    };
  },
}));

import { moveClaimedPhoto } from "@/lib/claim-merge.server";

beforeEach(() => {
  moves = [];
  moveError = null;
  moveThrows = false;
  adminCreated = 0;
});

describe("moveClaimedPhoto", () => {
  it("moves the photo into the claimed entry's folder with the service role", async () => {
    const moved = await moveClaimedPhoto({
      claim_id: "c1",
      person_id: "claimed",
      photo_from: "tree/stub/photo.jpg",
      photo_to: "tree/claimed/photo.jpg",
    });
    expect(moved).toBe(true);
    expect(moves).toEqual([
      { bucket: "photos", from: "tree/stub/photo.jpg", to: "tree/claimed/photo.jpg" },
    ]);
  });

  it("touches no storage when no photo came along", async () => {
    const moved = await moveClaimedPhoto({
      claim_id: "c1",
      person_id: "claimed",
      photo_from: null,
      photo_to: null,
    });
    expect(moved).toBe(false);
    expect(adminCreated).toBe(0);
    expect(moves).toEqual([]);
  });

  it("moves nothing outside the claimed entry's folder", async () => {
    const moved = await moveClaimedPhoto({
      claim_id: "c1",
      person_id: "claimed",
      photo_from: "tree/stub/photo.jpg",
      photo_to: "tree/someone/photo.jpg",
    });
    expect(moved).toBe(false);
    expect(moves).toEqual([]);
  });

  it("reports a move that failed, without throwing", async () => {
    moveError = { message: "Object not found" };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const moved = await moveClaimedPhoto({
      claim_id: "c1",
      person_id: "claimed",
      photo_from: "tree/stub/photo.jpg",
      photo_to: "tree/claimed/photo.jpg",
    });
    expect(moved).toBe(false);
    expect(logged).toHaveBeenCalledWith(
      "[claim-merge] the claimed photo didn't move",
      "Object not found",
    );
    logged.mockRestore();
  });

  it("never throws, so a claim that went through still says so", async () => {
    moveThrows = true;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      moveClaimedPhoto({
        claim_id: "c1",
        person_id: "claimed",
        photo_from: "tree/stub/photo.jpg",
        photo_to: "tree/claimed/photo.jpg",
      }),
    ).resolves.toBe(false);
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });
});
