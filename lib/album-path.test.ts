import { describe, expect, it } from "vitest";

import { albumPath, isAlbumPathOn } from "@/lib/album-path";

const TREE = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("albumPath", () => {
  it("files a photo under the tree it's added on, with a fresh name", () => {
    const a = albumPath(TREE, "image/jpeg");
    const b = albumPath(TREE, "image/jpeg");
    expect(a).toMatch(new RegExp(`^${TREE}/[0-9a-f-]{36}\\.jpg$`));
    expect(a).not.toBe(b);
    expect(isAlbumPathOn(a!, TREE)).toBe(true);
    expect(albumPath(TREE, "image/png")).toMatch(/\.png$/);
    expect(albumPath(TREE, "image/webp")).toMatch(/\.webp$/);
  });

  it("takes only what the bucket takes", () => {
    expect(albumPath(TREE, "image/heic")).toBeNull();
    expect(albumPath(TREE, "application/pdf")).toBeNull();
    expect(albumPath(TREE, "")).toBeNull();
  });
});

describe("isAlbumPathOn", () => {
  it("takes only a file directly in that tree's folder", () => {
    expect(isAlbumPathOn(`${TREE}/x.jpg`, TREE)).toBe(true);
    expect(isAlbumPathOn(`${TREE}/x.jpg`, OTHER)).toBe(false);
    expect(isAlbumPathOn(`${TREE}/deeper/x.jpg`, TREE)).toBe(false);
    expect(isAlbumPathOn(`${TREE}/`, TREE)).toBe(false);
    expect(isAlbumPathOn(`${TREE}/..`, TREE)).toBe(false);
    expect(isAlbumPathOn(TREE, TREE)).toBe(false);
  });
});
