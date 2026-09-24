import { describe, expect, it } from "vitest";

import {
  claimedPhotoMove,
  mergeConfirmation,
  relativesThatMove,
} from "@/lib/claim-merge";

const person = (id: string, first: string, last = "Rattansi") => ({
  id,
  first_name: first,
  preferred_name: null,
  last_name: last,
});

// dad — mum
//    |
//  stub — partner      (stub: the member's own placeholder)
//    |      sister
//   kid
const people = [
  person("stub", "Ali"),
  person("dad", "Karim"),
  person("mum", "Amina"),
  person("partner", "Sam", "Okafor"),
  person("sister", "Zara"),
  person("kid", "Noor"),
  person("claimed", "Ali"),
  person("stranger", "Omar", "Shah"),
];
const lines = [
  { from_person: "dad", to_person: "stub", type: "parent" },
  { from_person: "mum", to_person: "stub", type: "parent" },
  { from_person: "stub", to_person: "partner", type: "spouse" },
  { from_person: "sister", to_person: "stub", type: "sibling" },
  { from_person: "stub", to_person: "kid", type: "parent" },
  { from_person: "dad", to_person: "mum", type: "spouse" },
  { from_person: "stranger", to_person: "claimed", type: "parent" },
];

describe("relativesThatMove", () => {
  it("reads each line from the member's side, parents first", () => {
    expect(relativesThatMove("stub", "claimed", people, lines)).toEqual([
      { id: "mum", name: "Amina Rattansi", relation: "parent" },
      { id: "dad", name: "Karim Rattansi", relation: "parent" },
      { id: "partner", name: "Sam Okafor", relation: "partner" },
      { id: "sister", name: "Zara Rattansi", relation: "sibling" },
      { id: "kid", name: "Noor Rattansi", relation: "child" },
    ]);
  });

  it("leaves out lines that don't touch the member's entry", () => {
    const moved = relativesThatMove("stub", "claimed", people, lines);
    expect(moved.map((r) => r.id)).not.toContain("stranger");
  });

  it("leaves out a line to the claimed entry, which the merge drops", () => {
    const withLine = [
      ...lines,
      { from_person: "claimed", to_person: "stub", type: "sibling" },
    ];
    expect(
      relativesThatMove("stub", "claimed", people, withLine).map((r) => r.id),
    ).not.toContain("claimed");
  });

  it("names nobody it can't see, and nobody twice", () => {
    const extra = [
      ...lines,
      { from_person: "offCanvas", to_person: "stub", type: "parent" },
      { from_person: "partner", to_person: "stub", type: "spouse" },
    ];
    const moved = relativesThatMove("stub", "claimed", people, extra);
    expect(moved.map((r) => r.id)).toEqual([
      "mum",
      "dad",
      "partner",
      "sister",
      "kid",
    ]);
  });

  it("is empty for a bare placeholder", () => {
    expect(relativesThatMove("stub", "claimed", people, [])).toEqual([]);
  });
});

describe("mergeConfirmation", () => {
  it("names who moves, grouped the way a family reads", () => {
    const moved = relativesThatMove("stub", "claimed", people, lines);
    expect(mergeConfirmation(moved)).toBe(
      "Your parents Amina Rattansi and Karim Rattansi, your partner Sam Okafor, your sibling Zara Rattansi, and your child Noor Rattansi will be connected to this entry instead, and the entry you added for yourself will be removed. This can't be undone.",
    );
  });

  it("sets two groups apart with a comma", () => {
    expect(
      mergeConfirmation([
        { id: "mum", name: "Amina", relation: "parent" },
        { id: "dad", name: "Karim", relation: "parent" },
        { id: "partner", name: "Sam", relation: "partner" },
      ]),
    ).toMatch(/^Your parents Amina and Karim, and your partner Sam will be/);
  });

  it("uses the singular for one relative", () => {
    expect(
      mergeConfirmation([{ id: "mum", name: "Amina", relation: "parent" }]),
    ).toBe(
      "Your parent Amina will be connected to this entry instead, and the entry you added for yourself will be removed. This can't be undone.",
    );
  });

  it("counts the rest of a long list rather than naming them all", () => {
    const kids = ["A", "B", "C", "D", "E"].map((name) => ({
      id: name,
      name,
      relation: "child" as const,
    }));
    expect(mergeConfirmation(kids)).toMatch(
      /^Your children A, B, C and 2 more will be connected/,
    );
  });

  it("still warns when nothing moves", () => {
    expect(mergeConfirmation([])).toBe(
      "The entry you added for yourself will be removed, and this one becomes yours. This can't be undone.",
    );
  });
});

describe("claimedPhotoMove", () => {
  const claim = (photo_from?: string | null, photo_to?: string | null) => ({
    claim_id: "c1",
    person_id: "claimed",
    photo_from,
    photo_to,
  });

  it("moves the placeholder's photo into the claimed entry's folder", () => {
    expect(
      claimedPhotoMove(claim("tree/stub/photo.jpg", "tree/claimed/photo.jpg")),
    ).toEqual({ from: "tree/stub/photo.jpg", to: "tree/claimed/photo.jpg" });
  });

  it("moves nothing when no photo came along", () => {
    expect(claimedPhotoMove(claim())).toBeNull();
    expect(claimedPhotoMove(claim(null, null))).toBeNull();
    expect(claimedPhotoMove(claim("tree/stub/photo.jpg", null))).toBeNull();
  });

  it("only moves into the claimed entry's own folder", () => {
    expect(
      claimedPhotoMove(claim("tree/stub/photo.jpg", "tree/someone/photo.jpg")),
    ).toBeNull();
    expect(
      claimedPhotoMove(claim("tree/claimed/photo.jpg", "tree/claimed/photo.jpg")),
    ).toBeNull();
  });

  it("keeps the tree and the file name", () => {
    expect(
      claimedPhotoMove(claim("tree/stub/photo.jpg", "other/claimed/photo.jpg")),
    ).toBeNull();
    expect(
      claimedPhotoMove(claim("tree/stub/photo.jpg", "tree/claimed/other.jpg")),
    ).toBeNull();
  });

  it("refuses anything but <tree>/<entry>/<file>", () => {
    expect(
      claimedPhotoMove(claim("tree/stub/x/photo.jpg", "tree/claimed/x/photo.jpg")),
    ).toBeNull();
    expect(claimedPhotoMove(claim("stub/photo.jpg", "claimed/photo.jpg"))).toBeNull();
    expect(claimedPhotoMove(claim("tree//photo.jpg", "tree/claimed/photo.jpg"))).toBeNull();
    expect(claimedPhotoMove(claim("tree/stub/..", "tree/claimed/.."))).toBeNull();
  });
});
