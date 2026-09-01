import { describe, expect, it } from "vitest";

import {
  filterNicknameGroups,
  foldName,
  groupNicknames,
  nicknameInputError,
} from "@/lib/nicknames";

describe("foldName", () => {
  it("lowercases, strips accents and punctuation", () => {
    expect(foldName("  O'Brien ")).toBe("obrien");
    expect(foldName("José")).toBe("jose");
    expect(foldName("Van Der Berg")).toBe("vanderberg");
  });
});

describe("nicknameInputError", () => {
  it("accepts a real pair", () => {
    expect(nicknameInputError("Robert", "Bob")).toBeNull();
  });

  it("rejects names that are too short", () => {
    expect(nicknameInputError("R", "Bob")).toMatch(/root name/);
    expect(nicknameInputError("Robert", "B")).toMatch(/nickname/);
  });

  it("rejects a nickname that folds onto its own root", () => {
    expect(nicknameInputError("Robert", "robert!")).toMatch(/differ/);
  });
});

describe("groupNicknames", () => {
  const rows = [
    { variant: "robert", canonical: "robert" },
    { variant: "bob", canonical: "robert" },
    { variant: "rob", canonical: "robert" },
    { variant: "alex", canonical: "alexandra" },
    { variant: "alexandra", canonical: "alexandra" },
  ];

  it("groups by root, drops identity rows, and sorts", () => {
    expect(groupNicknames(rows)).toEqual([
      { canonical: "alexandra", variants: ["alex"] },
      { canonical: "robert", variants: ["bob", "rob"] },
    ]);
  });

  it("keeps a group whose only row is the identity row", () => {
    expect(groupNicknames([{ variant: "mary", canonical: "mary" }])).toEqual([
      { canonical: "mary", variants: [] },
    ]);
  });
});

describe("filterNicknameGroups", () => {
  const groups = [
    { canonical: "robert", variants: ["bob", "rob"] },
    { canonical: "william", variants: ["bill"] },
  ];

  it("matches on the root or any nickname", () => {
    expect(filterNicknameGroups(groups, "bill")).toEqual([groups[1]]);
    expect(filterNicknameGroups(groups, "Rob")).toEqual([groups[0]]);
  });

  it("returns everything for an empty query", () => {
    expect(filterNicknameGroups(groups, "  ")).toEqual(groups);
  });
});
