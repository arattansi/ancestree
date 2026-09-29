import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.fn();
const remove = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload, remove }) } }),
}));

import { attachPhoto, PHOTO_NOT_SAVED, uploadPhoto } from "@/lib/photo-upload";

const owner = { kind: "person", treeId: "t1", personId: "p1" } as const;
const png = new File(["x"], "gran.png", { type: "image/png" });

describe("photo upload (Step 77.4)", () => {
  beforeEach(() => {
    upload.mockReset().mockResolvedValue({ error: null });
    remove.mockReset().mockResolvedValue({ error: null });
  });

  it("keeps the file's own type, in its owner's folder", async () => {
    const path = await uploadPhoto(owner, png);
    expect(path).toMatch(/^t1\/p1\/[0-9a-f-]{36}\.png$/);
    expect(upload).toHaveBeenCalledWith(path, png, {
      contentType: "image/png",
      upsert: false,
    });
  });

  it("refuses what isn't a photo the bucket takes", async () => {
    const gif = new File(["x"], "a.gif", { type: "image/gif" });
    await expect(uploadPhoto(owner, gif)).rejects.toThrow();
    expect(upload).not.toHaveBeenCalled();
  });

  it("points the entry at it", async () => {
    const attach = vi.fn().mockResolvedValue({});
    await expect(attachPhoto(owner, png, attach)).resolves.toEqual({});
    expect(attach).toHaveBeenCalledWith(upload.mock.calls[0][0]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes the file again when the entry refuses it", async () => {
    const attach = vi.fn().mockResolvedValue({ error: "Not yours." });
    await expect(attachPhoto(owner, png, attach)).resolves.toEqual({
      error: "Not yours.",
    });
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
  });

  it("keeps the file when the attach can't be reached: it may have landed", async () => {
    const attach = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(attachPhoto(owner, png, attach)).resolves.toEqual({
      error: PHOTO_NOT_SAVED,
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("lets a redirect through, and says an upload that failed", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/join;307;",
    });
    await expect(
      attachPhoto(owner, png, vi.fn().mockRejectedValue(redirect)),
    ).rejects.toBe(redirect);
    upload.mockResolvedValueOnce({ error: { message: "The resource already exists" } });
    const attach = vi.fn();
    await expect(attachPhoto(owner, png, attach)).resolves.toEqual({
      error: PHOTO_NOT_SAVED,
    });
    expect(attach).not.toHaveBeenCalled();
  });
});
