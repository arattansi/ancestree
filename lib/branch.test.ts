import { describe, expect, it } from "vitest";

import {
  branchIds,
  canEditCompanion,
  canEditConnection,
  canEditEntry,
  type BranchEdge,
  type EntrySubject,
  type Viewer,
} from "@/lib/branch";

const parent = (from: string, to: string): BranchEdge => ({
  from_person: from,
  to_person: to,
  type: "parent",
});
const spouse = (a: string, b: string): BranchEdge => ({
  from_person: a,
  to_person: b,
  type: "spouse",
});

/**
 * The shape this role was designed against: Arzu's family. Karmali and Sonbhai
 * head the line; their son Fatehali and his wife Roshen had Arzu and Ashif;
 * Arzu married Shireen and had Rehan; Ashif married Safia and had Raiya, who
 * married Aalim. Safia's own parents and Aalim's parents hang off the sides.
 */
const family: BranchEdge[] = [
  parent("karmali", "fatehali"),
  parent("sonbhai", "fatehali"),
  spouse("karmali", "sonbhai"),
  parent("fatehali", "arzu"),
  parent("roshen", "arzu"),
  parent("fatehali", "ashif"),
  parent("roshen", "ashif"),
  spouse("fatehali", "roshen"),
  parent("arzu", "rehan"),
  parent("shireen", "rehan"),
  spouse("arzu", "shireen"),
  parent("ashif", "raiya"),
  parent("safia", "raiya"),
  spouse("ashif", "safia"),
  spouse("raiya", "aalim"),
  parent("noorali", "safia"),
  parent("kulsum", "safia"),
  parent("noorali", "amyn"),
  parent("minaz", "aalim"),
  parent("hussein", "minaz"),
];

describe("branchIds", () => {
  it("reaches ancestors, their descendants, and the partners along the way", () => {
    expect(branchIds("arzu", family)).toEqual(
      new Set([
        "karmali",
        "sonbhai",
        "fatehali",
        "roshen",
        "arzu",
        "ashif",
        "rehan",
        "raiya",
        "shireen",
        "safia",
        "aalim",
      ]),
    );
  });

  it("stops at a partner instead of walking into their family", () => {
    const branch = branchIds("arzu", family);
    // Safia married in; her parents and her brother stay on their own side.
    expect(branch.has("safia")).toBe(true);
    expect(branch.has("noorali")).toBe(false);
    expect(branch.has("kulsum")).toBe(false);
    expect(branch.has("amyn")).toBe(false);
    // Same for Aalim, who married Arzu's niece.
    expect(branch.has("aalim")).toBe(true);
    expect(branch.has("minaz")).toBe(false);
    expect(branch.has("hussein")).toBe(false);
  });

  it("does not cross from one partner to another", () => {
    // A married pair with no blood link to the root: neither should appear.
    const edges = [...family, spouse("amyn", "outsider")];
    expect(branchIds("arzu", edges).has("outsider")).toBe(false);
  });

  it("is the whole branch seen from either end of it", () => {
    // Raiya sits a generation below Arzu; her branch climbs to the same head.
    const fromRaiya = branchIds("raiya", family);
    expect(fromRaiya.has("karmali")).toBe(true);
    expect(fromRaiya.has("arzu")).toBe(true);
    // But her mother's family is blood to her, so it is on her branch.
    expect(fromRaiya.has("noorali")).toBe(true);
    expect(fromRaiya.has("amyn")).toBe(true);
  });

  it("gives a person with no connections a branch of one", () => {
    expect(branchIds("nobody", family)).toEqual(new Set(["nobody"]));
  });
});

const entry = (over: Partial<EntrySubject> = {}): EntrySubject => ({
  id: "fatehali",
  owner_user_id: "raiya-user",
  created_by: "raiya-user",
  isClaimed: false,
  isSomeoneElsesOwn: false,
  ...over,
});

const branchAdmin: Viewer = {
  userId: "arzu-user",
  role: "branch_admin",
  branch: branchIds("arzu", family),
};
const member: Viewer = { userId: "arzu-user", role: "member", branch: null };

describe("canEditEntry", () => {
  it("lets a branch admin edit an entry someone else created on their branch", () => {
    expect(canEditEntry(entry(), branchAdmin)).toBe(true);
    expect(canEditEntry(entry(), member)).toBe(false);
  });

  it("keeps a branch admin off entries beyond their branch", () => {
    expect(canEditEntry(entry({ id: "noorali" }), branchAdmin)).toBe(false);
    expect(canEditEntry(entry({ id: "minaz" }), branchAdmin)).toBe(false);
  });

  it("leaves another member's own entry to them", () => {
    const raiya = entry({ id: "raiya", isSomeoneElsesOwn: true });
    expect(canEditEntry(raiya, branchAdmin)).toBe(false);
  });

  it("still honours owner and creator rights off-branch", () => {
    const mine = entry({
      id: "minaz",
      owner_user_id: "arzu-user",
      created_by: "arzu-user",
    });
    expect(canEditEntry(mine, branchAdmin)).toBe(true);
    expect(canEditEntry(mine, member)).toBe(true);
  });

  it("drops creator rights once an entry is claimed", () => {
    const claimed = entry({
      id: "minaz",
      owner_user_id: "arzu-user",
      created_by: "arzu-user",
      isClaimed: true,
    });
    // Owner still matches, so the claimant keeps it; a stale creator does not.
    expect(
      canEditEntry(
        { ...claimed, owner_user_id: "someone-else" },
        { ...member, userId: "arzu-user" },
      ),
    ).toBe(false);
  });

  it("gives an admin everything", () => {
    const admin: Viewer = { userId: "a", role: "admin", branch: null };
    expect(canEditEntry(entry({ id: "noorali" }), admin)).toBe(true);
    expect(canEditEntry(entry({ isSomeoneElsesOwn: true }), admin)).toBe(true);
  });
});

describe("canEditConnection", () => {
  const line = (from: string, to: string) => ({
    from_person: from,
    to_person: to,
    created_by: "raiya-user",
  });

  it("lets a branch admin fix a line drawn between two people on their branch", () => {
    expect(canEditConnection(line("fatehali", "arzu"), branchAdmin)).toBe(true);
    expect(canEditConnection(line("fatehali", "arzu"), member)).toBe(false);
  });

  it("needs both ends on the branch", () => {
    // Safia is on the branch; her father is not.
    expect(canEditConnection(line("noorali", "safia"), branchAdmin)).toBe(
      false,
    );
    expect(canEditConnection(line("minaz", "aalim"), branchAdmin)).toBe(false);
  });

  it("keeps the creator's own rights", () => {
    const mine = { ...line("noorali", "amyn"), created_by: "arzu-user" };
    expect(canEditConnection(mine, member)).toBe(true);
  });
});

describe("canEditCompanion", () => {
  // Whether the viewer can edit a given person — what the canvas answers with
  // `canEditEntry` for each of the pet's people.
  const editable =
    (viewer: Viewer) =>
    (personId: string): boolean =>
      canEditEntry(entry({ id: personId }), viewer);

  it("lets whoever added the companion edit it", () => {
    const pet = { created_by: "arzu-user", companions: ["noorali"] };
    expect(canEditCompanion(pet, member, editable(member))).toBe(true);
  });

  it("follows a branch admin through a companion's person on their branch", () => {
    const pet = { created_by: "raiya-user", companions: ["noorali", "safia"] };
    expect(canEditCompanion(pet, branchAdmin, editable(branchAdmin))).toBe(
      true,
    );
  });

  it("keeps a member off a companion none of whose people are theirs", () => {
    const pet = { created_by: "raiya-user", companions: ["safia"] };
    expect(canEditCompanion(pet, member, editable(member))).toBe(false);
    const offBranch = { created_by: "raiya-user", companions: ["noorali"] };
    expect(
      canEditCompanion(offBranch, branchAdmin, editable(branchAdmin)),
    ).toBe(false);
  });

  it("gives an admin every companion", () => {
    const admin: Viewer = { userId: "a", role: "admin", branch: null };
    const pet = { created_by: "raiya-user", companions: ["noorali"] };
    expect(canEditCompanion(pet, admin, () => false)).toBe(true);
  });
});
