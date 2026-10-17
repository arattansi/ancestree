import { describe, expect, it } from "vitest";

import {
  everyTreeHandedOver,
  loneTrees,
  readDeleteAccountRequest,
  soleRootTrees,
} from "@/lib/account-deletion";

const OAK = "11111111-1111-4111-8111-111111111111";
const ASH = "22222222-2222-4222-8222-222222222222";
const ELM = "33333333-3333-4333-8333-333333333333";
const RAIYA = "44444444-4444-4444-8444-444444444444";
const ZED = "55555555-5555-4555-8555-555555555555";

describe("soleRootTrees", () => {
  const trees = [
    { id: OAK, name: "Oak", role: "admin" },
    { id: ASH, name: "Ash", role: "admin" },
    { id: ELM, name: "Elm", role: "member" },
  ];

  it("lists trees they run alone, with who could take over, sorted", () => {
    const out = soleRootTrees(trees, [
      { tree_id: OAK, auth_user_id: ZED, display_name: "Zed", role: "member" },
      { tree_id: OAK, auth_user_id: RAIYA, display_name: "Raiya", role: "branch_admin" },
      { tree_id: ELM, auth_user_id: RAIYA, display_name: "Raiya", role: "admin" },
    ]);
    expect(out).toEqual([
      {
        treeId: OAK,
        treeName: "Oak",
        successors: [
          { userId: RAIYA, name: "Raiya (Branch)" },
          { userId: ZED, name: "Zed (Leaf)" },
        ],
      },
      // Nobody else on Ash: it goes with the account.
      { treeId: ASH, treeName: "Ash", successors: [] },
    ]);
  });

  it("skips a tree with another Root, and trees they don't run", () => {
    const out = soleRootTrees(trees, [
      { tree_id: OAK, auth_user_id: RAIYA, display_name: "Raiya", role: "admin" },
      { tree_id: ASH, auth_user_id: ZED, display_name: null, role: "member" },
    ]);
    expect(out).toEqual([
      { treeId: ASH, treeName: "Ash", successors: [{ userId: ZED, name: "Unnamed member (Leaf)" }] },
    ]);
  });

  it("doesn't count a member row with no account", () => {
    const out = soleRootTrees([{ id: OAK, name: "Oak", role: "admin" }], [
      { tree_id: OAK, auth_user_id: null, display_name: "Gone", role: "admin" },
    ]);
    expect(loneTrees(out)).toEqual([{ treeId: OAK, treeName: "Oak", successors: [] }]);
  });
});

describe("everyTreeHandedOver", () => {
  const trees = [
    { treeId: OAK, treeName: "Oak", successors: [{ userId: RAIYA, name: "Raiya (Leaf)" }] },
    { treeId: ASH, treeName: "Ash", successors: [] },
  ];

  it("needs a successor wherever there's someone to choose", () => {
    expect(everyTreeHandedOver(trees, {})).toBe(false);
    expect(everyTreeHandedOver(trees, { [OAK]: RAIYA })).toBe(true);
  });

  it("asks nothing of a lone tree", () => {
    expect(everyTreeHandedOver([trees[1]], {})).toBe(true);
  });
});

describe("readDeleteAccountRequest", () => {
  it("takes an empty body as nothing to hand over", () => {
    expect(readDeleteAccountRequest(null)).toEqual({
      request: { successors: {}, deleteTrees: [] },
    });
    expect(readDeleteAccountRequest({})).toEqual({
      request: { successors: {}, deleteTrees: [] },
    });
  });

  it("reads successors and trees to delete, once each", () => {
    expect(
      readDeleteAccountRequest({ successors: { [OAK]: RAIYA }, deleteTrees: [ASH, ASH] }),
    ).toEqual({ request: { successors: { [OAK]: RAIYA }, deleteTrees: [ASH] } });
  });

  it("refuses anything but UUIDs", () => {
    for (const body of [
      [],
      "oak",
      { successors: { "*": RAIYA } },
      { successors: { [OAK]: 7 } },
      { successors: [RAIYA] },
      { deleteTrees: ASH },
      { deleteTrees: ["ash"] },
    ]) {
      expect(readDeleteAccountRequest(body)).toHaveProperty("problem");
    }
  });
});
