import { describe, expect, it } from "vitest";

import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_KEYS,
  ASSIGNABLE_ACCOUNT_TYPES,
  BRANCH,
  INVITED_AS,
  LEAF,
  ROOT,
  accountTypeOf,
  branchSideLabel,
  describeAccess,
  isAccountTypeKey,
  isAssignable,
  isOwnLineRefusal,
  type Reach,
} from "@/lib/account-types";

/** Widest first, the order `Reach` promises. */
const WIDTH: Reach[] = ["tree", "branch", "own"];
const width = (r: Reach) => WIDTH.indexOf(r);

describe("account types", () => {
  it("names every stored role, from the ground up", () => {
    expect(ACCOUNT_TYPES.map((t) => t.name)).toEqual([
      "Root",
      "Branch",
      "Leaf",
    ]);
    expect(ACCOUNT_TYPES.map((t) => t.key)).toEqual([...ACCOUNT_TYPE_KEYS]);
  });

  it("maps the stored keys to their names", () => {
    expect(accountTypeOf("admin")).toBe(ROOT);
    expect(accountTypeOf("branch_admin")).toBe(BRANCH);
    expect(accountTypeOf("member")).toBe(LEAF);
  });

  it("reads anything unrecognised as the narrowest type", () => {
    expect(accountTypeOf(undefined)).toBe(LEAF);
    expect(accountTypeOf(null)).toBe(LEAF);
    expect(accountTypeOf("")).toBe(LEAF);
    expect(accountTypeOf("root")).toBe(LEAF);
    expect(isAccountTypeKey("root")).toBe(false);
  });

  it("retires the first Leaf's key, reading it as the Leaf it became", () => {
    expect(isAccountTypeKey("leaf")).toBe(false);
    expect(accountTypeOf("leaf")).toBe(LEAF);
  });

  it("never lets a type reach further than the one above it", () => {
    for (let i = 1; i < ACCOUNT_TYPES.length; i++) {
      const above = ACCOUNT_TYPES[i - 1];
      const below = ACCOUNT_TYPES[i];
      expect(width(below.entries)).toBeGreaterThanOrEqual(width(above.entries));
      expect(width(below.connections)).toBeGreaterThanOrEqual(
        width(above.connections),
      );
      expect(width(below.companions)).toBeGreaterThanOrEqual(
        width(above.companions),
      );
    }
  });

  it("keeps running the tree to a Root", () => {
    expect(ACCOUNT_TYPES.filter((t) => t.runsTree)).toEqual([ROOT]);
  });

  it("keeps a Leaf's new entries to their own line, and nobody else's", () => {
    expect(LEAF.addRelatives).toBe("line");
    expect(ROOT.addRelatives).toBe("tree");
    expect(BRANCH.addRelatives).toBe("tree");
    expect(LEAF.entries).toBe("own");
    expect(LEAF.connections).toBe("own");
  });

  it("offers a Root every type to hand out, Root included", () => {
    expect(ASSIGNABLE_ACCOUNT_TYPES).toEqual([ROOT, BRANCH, LEAF]);
    expect(isAssignable("admin")).toBe(true);
    expect(isAssignable("branch_admin")).toBe(true);
    expect(isAssignable("member")).toBe(true);
    expect(isAssignable("leaf")).toBe(false);
    expect(isAssignable("gardener")).toBe(false);
  });

  it("brings everyone in by invite as a Leaf", () => {
    expect(INVITED_AS).toBe(LEAF);
  });
});

describe("describeAccess", () => {
  const valueOf = (t: typeof ROOT, label: string) =>
    describeAccess(t).find((a) => a.label === label)?.value;

  it("asks the same questions of every type", () => {
    const labels = describeAccess(ROOT).map((a) => a.label);
    for (const t of ACCOUNT_TYPES) {
      expect(describeAccess(t).map((a) => a.label)).toEqual(labels);
    }
  });

  it("lets everyone see, comment and flag", () => {
    for (const t of ACCOUNT_TYPES) {
      expect(valueOf(t, "See the whole tree")).toBe(true);
      expect(valueOf(t, "Comment on and flag entries")).toBe(true);
    }
  });

  it("says how far each type's edits reach", () => {
    expect(valueOf(ROOT, "Edit entries")).toBe(true);
    expect(valueOf(BRANCH, "Edit entries")).toBe("Their part of a Root’s side");
    expect(valueOf(LEAF, "Edit entries")).toBe("The ones they added");
    expect(valueOf(ROOT, "See documents")).toBe(true);
    expect(valueOf(BRANCH, "See documents")).toBe(
      "Their part of a Root’s side",
    );
    expect(valueOf(LEAF, "See documents")).toBe("Entries they own");
    expect(valueOf(LEAF, "Change connections")).toBe("The ones they drew");
  });

  it("says where each type adds relatives", () => {
    expect(valueOf(ROOT, "Add relatives")).toBe(true);
    expect(valueOf(BRANCH, "Add relatives")).toBe(true);
    expect(valueOf(LEAF, "Add relatives")).toBe("On their own line");
    for (const t of ACCOUNT_TYPES) {
      expect(valueOf(t, "Add companions")).toBe(true);
    }
  });

  it("lets every type invite, and only as Leaves", () => {
    for (const t of ACCOUNT_TYPES) {
      expect(valueOf(t, "Invite relatives")).toBe("As Leaves");
    }
    expect(valueOf(ROOT, "Invite someone to claim an entry")).toBe(true);
    expect(valueOf(LEAF, "Invite someone to claim an entry")).toBe(
      "The ones they added",
    );
  });

  it("lets a Root delete anything, a Branch and a Leaf their own", () => {
    expect(valueOf(ROOT, "Delete entries")).toBe(true);
    for (const t of [BRANCH, LEAF]) {
      expect(valueOf(t, "Delete entries")).toBe(
        "Ones they added, until someone else builds on them",
      );
    }
  });
});

describe("branchSideLabel", () => {
  it("names the one Root's side a Branch tends", () => {
    expect(branchSideLabel(["Raiya Suleman"])).toBe("Raiya Suleman’s side");
  });

  it("names every side for someone related to more than one Root", () => {
    expect(branchSideLabel(["Aalim Rattansi", "Raiya Suleman"])).toBe(
      "Aalim Rattansi’s and Raiya Suleman’s sides",
    );
    expect(branchSideLabel(["A", "B", "C"])).toBe("A’s, B’s and C’s sides");
  });

  it("has nothing to say for someone related to no Root", () => {
    expect(branchSideLabel([])).toBeNull();
  });
});

describe("isOwnLineRefusal", () => {
  it("knows the database's own-line refusal from other failures", () => {
    expect(
      isOwnLineRefusal("OWN_LINE: a Leaf adds relatives on their own line"),
    ).toBe(true);
    expect(isOwnLineRefusal("BLOODLINE_GATE: new entries must connect")).toBe(
      false,
    );
    expect(isOwnLineRefusal(undefined)).toBe(false);
  });
});
