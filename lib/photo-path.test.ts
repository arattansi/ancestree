import { describe, expect, it } from "vitest";

import { PHOTO_EXTENSIONS, photoPath, photoPathOwner } from "@/lib/photo-path";

const TREE = "0e062f4d-b471-477c-85d5-76147c32f51f";
const PERSON = "12fe0d78-7355-44b2-97ad-261dbeb782b7";
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
