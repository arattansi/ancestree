import { describe, expect, it } from "vitest";

import {
  BRANCH_IN_A_LINE,
  branchOffer,
  joinerFirstName,
  objectWord,
  treeStanding,
} from "@/lib/join-notices";

const base = {
  type: "member_joined",
  joinerId: "nadia",
  joinerRole: "member",
  viewerIsRoot: true,
  roots: 1,
  branchesMade: 0,
  firstName: "Nadia",
  sex: "female",
};

describe("branchOffer", () => {
  it("offers a Root making the joiner a Branch, by pronoun", () => {
    expect(branchOffer(base)).toEqual({
      userId: "nadia",
      done: "Nadia is a Branch now.",
      label: "make her a branch",
      unavailable: null,
    });
    expect(branchOffer({ ...base, sex: "male", firstName: "Sami" })?.label).toBe(
      "make him a branch",
    );
  });

  it("names them when their entry says nothing of who they are", () => {
    expect(branchOffer({ ...base, sex: null })?.label).toBe("make Nadia a branch");
    expect(branchOffer({ ...base, sex: "other" })?.label).toBe("make Nadia a branch");
    const nameless = branchOffer({ ...base, sex: null, firstName: null });
    expect(nameless?.label).toBe("make them a branch");
    expect(nameless?.done).toBe("They’re a Branch now.");
  });

  it("is on every notice a join sends, and nothing else", () => {
    for (const type of ["member_joined", "joined_by_link", "placed_on_join"]) {
      expect(branchOffer({ ...base, type })).not.toBeNull();
    }
    for (const type of ["person_added", "claim_approved", "invite_renewed"]) {
      expect(branchOffer({ ...base, type })).toBeNull();
    }
  });

  it("is only a Root's, and only while the joiner is a Leaf there", () => {
    expect(branchOffer({ ...base, viewerIsRoot: false })).toBeNull();
    expect(branchOffer({ ...base, joinerRole: "branch_admin" })).toBeNull();
    expect(branchOffer({ ...base, joinerRole: "admin" })).toBeNull();
    // Gone from the tree since.
    expect(branchOffer({ ...base, joinerRole: null })).toBeNull();
    expect(branchOffer({ ...base, joinerId: null })).toBeNull();
  });

  it("says why once the Root has made their four Branches", () => {
    expect(branchOffer({ ...base, branchesMade: 3 })?.unavailable).toBeNull();
    expect(branchOffer({ ...base, branchesMade: 4 })?.unavailable).toBe(
      "You’ve made your four Branches.",
    );
  });
});

describe("objectWord", () => {
  it("never guesses", () => {
    expect(objectWord("female", "Nadia")).toBe("her");
    expect(objectWord("male", "Sami")).toBe("him");
    expect(objectWord(null, " Nadia ")).toBe("Nadia");
    expect(objectWord(undefined, "")).toBe("them");
  });
});

describe("joinerFirstName", () => {
  it("prefers the name they go by on their entry, then their account's", () => {
    expect(joinerFirstName({ first_name: "Nadia", preferred_name: "Nadi" }, "N H")).toBe("Nadi");
    expect(joinerFirstName({ first_name: "Nadia", preferred_name: null }, null)).toBe("Nadia");
    expect(joinerFirstName(null, "Sami Haddad")).toBe("Sami");
    expect(joinerFirstName({ first_name: " ", preferred_name: "" }, "  ")).toBeNull();
  });
});

describe("treeStanding", () => {
  it("counts the tree's Roots and the Branches this Root made", () => {
    const rows = [
      { tree_id: "t", auth_user_id: "me", role: "admin", branch_granted_by: null },
      { tree_id: "t", auth_user_id: "co", role: "admin", branch_granted_by: null },
      { tree_id: "t", auth_user_id: "b1", role: "branch_admin", branch_granted_by: "me" },
      { tree_id: "t", auth_user_id: "b2", role: "branch_admin", branch_granted_by: "co" },
      { tree_id: "u", auth_user_id: "me", role: "member", branch_granted_by: null },
    ].map((r) => ({ ...r, display_name: null, self_person_id: null }));
    const standing = treeStanding(rows, "me");
    expect(standing.get("t")).toEqual({ viewerIsRoot: true, roots: 2, branchesMade: 1 });
    expect(standing.get("u")).toEqual({ viewerIsRoot: false, roots: 0, branchesMade: 0 });
  });
});

it("says what a Branch is in one line", () => {
  expect(BRANCH_IN_A_LINE.split(/[.!?]\s/).length).toBe(1);
});
