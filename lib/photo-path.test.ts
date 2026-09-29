import { describe, expect, it } from "vitest";

import {
  PHOTO_EXTENSIONS,
  photoPath,
  photoPathOwner,
  photosLeftBehind,
} from "@/lib/photo-path";

const TREE = "0e062f4d-b471-477c-85d5-76147c32f51f";
const OTHER_TREE = "5d5c1b8e-58c4-4a0e-9d3e-0f8f0a4c2b11";
const PERSON = "12fe0d78-7355-44b2-97ad-261dbeb782b7";
const SOMEONE = "8a0b54f1-3f5e-4c2d-a7f6-2f1c9e0d4b37";
const PET = "6171652a-1066-454a-a254-a9d4930dd0bb";

describe("photo paths (Step 77.4)", () => {
  it("lays a person's photo out as the bucket's policies read it", () => {
    const path = photoPath({ kind: "person", treeId: TREE, personId: PERSON }, "png");
    expect(path).toMatch(new RegExp(`^${TREE}/${PERSON}/[0-9a-f-]{36}\\.png$`));
    expect(photoPathOwner(path)).toEqual({ kind: "person", treeId: TREE, personId: PERSON });
  });

  it("lays a companion's out under pets", () => {
    const path = photoPath({ kind: "pet", treeId: TREE, petId: PET }, "jpg");
    expect(path).toMatch(new RegExp(`^${TREE}/pets/${PET}/[0-9a-f-]{36}\\.jpg$`));
    expect(photoPathOwner(path)).toEqual({ kind: "pet", treeId: TREE, petId: PET });
  });

  it("owns up to no path laid out otherwise", () => {
    for (const bad of [
      "",
      "photo.jpg",
      `${TREE}/photo.jpg`,
      `${TREE}/${PERSON}/../x.jpg`,
      `${TREE}//x.jpg`,
      `${TREE}/pets/x.jpg`,
      `${TREE}/${PERSON}/a/b.jpg`,
    ]) {
      expect(photoPathOwner(bad)).toBeNull();
    }
  });

  it("names the three types the bucket takes, and no other", () => {
    expect(PHOTO_EXTENSIONS["image/jpeg"]).toBe("jpg");
    expect(PHOTO_EXTENSIONS["image/png"]).toBe("png");
    expect(PHOTO_EXTENSIONS["image/webp"]).toBe("webp");
    expect(PHOTO_EXTENSIONS["image/gif"]).toBeUndefined();
  });
});

describe("photos a save left behind (Step 82)", () => {
  const old = `${TREE}/${PERSON}/old.jpg`;
  const fresh = `${TREE}/${PERSON}/new.jpg`;

  it("leaves the old photo when a new one replaces it, or none does", () => {
    expect(photosLeftBehind("person", PERSON, [old], fresh)).toEqual([old]);
    expect(photosLeftBehind("person", PERSON, [old], null)).toEqual([old]);
    expect(photosLeftBehind("person", PERSON, [old])).toEqual([old]);
  });

  it("leaves nothing when there was no photo, or it's the one still shown", () => {
    expect(photosLeftBehind("person", PERSON, [null, undefined, ""], fresh)).toEqual([]);
    expect(photosLeftBehind("person", PERSON, [fresh], fresh)).toEqual([]);
  });

  it("takes the entry's folder under any tree it's on, once each", () => {
    const elsewhere = `${OTHER_TREE}/${PERSON}/a.png`;
    expect(photosLeftBehind("person", PERSON, [elsewhere, old, elsewhere])).toEqual([
      elsewhere,
      old,
    ]);
  });

  it("never names a file outside the entry's own folder", () => {
    for (const planted of [
      `${TREE}/${SOMEONE}/theirs.jpg`,
      `${TREE}/pets/${PERSON}/a.jpg`,
      `${TREE}/${PERSON}/../${SOMEONE}/x.jpg`,
      `${TREE}/${PERSON}`,
      `${PERSON}/a.jpg`,
      "a.jpg",
    ]) {
      expect(photosLeftBehind("person", PERSON, [planted])).toEqual([]);
    }
  });

  it("keeps a companion's to its own folder, and a person's out of it", () => {
    const pets = `${TREE}/pets/${PET}/old.webp`;
    expect(photosLeftBehind("pet", PET, [pets], null)).toEqual([pets]);
    expect(photosLeftBehind("pet", PET, [`${OTHER_TREE}/pets/${PET}/x.jpg`])).toEqual([
      `${OTHER_TREE}/pets/${PET}/x.jpg`,
    ]);
    expect(photosLeftBehind("pet", PET, [`${TREE}/pets/${SOMEONE}/x.jpg`])).toEqual([]);
    expect(photosLeftBehind("pet", PET, [`${TREE}/${PET}/x.jpg`])).toEqual([]);
    expect(photosLeftBehind("person", PET, [pets])).toEqual([]);
  });
});
