import { describe, expect, it } from "vitest";

import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_KEYS,
  ASSIGNABLE_ACCOUNT_TYPES,
  BRANCH,
  CANOPY,
  LEAF,
  ROOT,
  accountTypeOf,
  branchSideLabel,
  describeAccess,
  isAccountTypeKey,
  isAssignable,
  type Reach,
} from "@/lib/account-types";

/** Widest first, the order `Reach` promises. */
const WIDTH: Reach[] = ["tree", "branch", "own", "self", "none"];
const width = (r: Reach) => WIDTH.indexOf(r);

describe("account types", () => {
  it("names every stored role, from the ground up", () => {
    expect(ACCOUNT_TYPES.map((t) => t.name)).toEqual([
      "Root",
      "Branch",
      "Canopy",
      "Leaf",
    ]);
    expect(ACCOUNT_TYPES.map((t) => t.key)).toEqual([...ACCOUNT_TYPE_KEYS]);
  });

  it("maps the stored keys to their names", () => {
    expect(accountTypeOf("admin")).toBe(ROOT);
    expect(accountTypeOf("branch_admin")).toBe(BRANCH);
    expect(accountTypeOf("member")).toBe(CANOPY);
    expect(accountTypeOf("leaf")).toBe(LEAF);
  });

  it("reads anything unrecognised as the narrowest type", () => {
    expect(accountTypeOf(undefined)).toBe(LEAF);
    expect(accountTypeOf(null)).toBe(LEAF);
    expect(accountTypeOf("")).toBe(LEAF);
    expect(accountTypeOf("root")).toBe(LEAF);
    expect(isAccountTypeKey("root")).toBe(false);
    expect(isAccountTypeKey("leaf")).toBe(true);
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

  it("leaves a Leaf their own entry and nothing that grows the tree", () => {
    expect(LEAF.entries).toBe("self");
    expect(LEAF.connections).toBe("none");
    expect(LEAF.companions).toBe("none");
    expect(LEAF.addRelatives).toBe(false);
  });

  it("offers a Root every type but Root to hand out", () => {
    expect(ASSIGNABLE_ACCOUNT_TYPES).toEqual([BRANCH, CANOPY, LEAF]);
    expect(isAssignable("admin")).toBe(false);
    expect(isAssignable("leaf")).toBe(true);
    expect(isAssignable("gardener")).toBe(false);
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
    expect(valueOf(BRANCH, "Edit entries")).toBe("Their Root’s side");
    expect(valueOf(CANOPY, "Edit entries")).toBe("The ones they added");
    expect(valueOf(LEAF, "Edit entries")).toBe("Only their own");
    expect(valueOf(LEAF, "Change connections")).toBe(false);
    expect(valueOf(LEAF, "Add relatives")).toBe(false);
    expect(valueOf(LEAF, "Add companions")).toBe(false);
  });

  it("gives a Root invites outright and everyone else when allowed", () => {
    expect(valueOf(ROOT, "Invite relatives")).toBe(true);
    expect(valueOf(CANOPY, "Invite relatives")).toBe("If a Root allows it");
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
