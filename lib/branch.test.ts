import { describe, expect, it } from "vitest";

import {
  branchIds,
  branchReach,
  canEditCompanion,
  canEditConnection,
  canEditEntry,
  canSeeDocuments,
  relatedRoots,
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

/** The Roots: Raiya and Aalim, the couple the tree is centred on. */
const roots = ["raiya", "aalim"];

describe("relatedRoots", () => {
  it("finds the Root a relative is related to by blood", () => {
    expect(relatedRoots("arzu", roots, family)).toEqual(["raiya"]);
    expect(relatedRoots("hussein", roots, family)).toEqual(["aalim"]);
  });

  it("counts marrying in as being related", () => {
    expect(relatedRoots("shireen", roots, family)).toEqual(["raiya"]);
  });

  it("finds both Roots for their child", () => {
    const edges = [...family, parent("raiya", "zara"), parent("aalim", "zara")];
    expect(relatedRoots("zara", roots, edges)).toEqual(["raiya", "aalim"]);
  });

  it("finds none for someone tied on only through an in-law", () => {
    // Amyn's wife is on Raiya's branch as a partner; her mother is not.
    const edges = [
      ...family,
      spouse("amyn", "yasmin"),
      parent("yasmin-mum", "yasmin"),
    ];
    expect(relatedRoots("yasmin", roots, edges)).toEqual(["raiya"]);
    expect(relatedRoots("yasmin-mum", roots, edges)).toEqual([]);
  });
});

describe("branchReach", () => {
  it("tends the Root's side, not the Branch's own", () => {
    const reach = branchReach("arzu", roots, family);
    expect(reach).toEqual(branchIds("raiya", family));
    // Raiya's mother's family: not Arzu's blood, but on Raiya's side.
    expect(branchIds("arzu", family).has("noorali")).toBe(false);
    expect(reach.has("noorali")).toBe(true);
    expect(reach.has("kulsum")).toBe(true);
    expect(reach.has("amyn")).toBe(true);
    // Aalim's family stays on Aalim's side.
    expect(reach.has("aalim")).toBe(true);
    expect(reach.has("minaz")).toBe(false);
    expect(reach.has("hussein")).toBe(false);
  });

  it("leaves out the Branch's own blood beyond the Root's side", () => {
    // Rehan's mother's father is his blood, and nothing to Raiya.
    const edges = [...family, parent("shireen-dad", "shireen")];
    expect(branchIds("rehan", edges).has("shireen-dad")).toBe(true);
    expect(branchReach("rehan", roots, edges).has("shireen-dad")).toBe(false);
  });

  it("tends both sides for a child of both Roots", () => {
    const edges = [...family, parent("raiya", "zara"), parent("aalim", "zara")];
    const reach = branchReach("zara", roots, edges);
    expect(reach.has("noorali")).toBe(true);
    expect(reach.has("hussein")).toBe(true);
  });

  it("tends nothing when related to no Root", () => {
    expect(branchReach("nobody", roots, family).size).toBe(0);
    expect(branchReach("arzu", [], family).size).toBe(0);
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
  selfPersonId: "arzu",
  branch: branchReach("arzu", roots, family),
};
const member: Viewer = {
  userId: "arzu-user",
  role: "member",
  selfPersonId: "arzu",
  branch: null,
};
const leaf: Viewer = {
  userId: "arzu-user",
  role: "leaf",
  selfPersonId: "arzu",
  branch: null,
};
const admin: Viewer = {
  userId: "a",
  role: "admin",
  selfPersonId: null,
  branch: null,
};

describe("canEditEntry", () => {
  it("lets a branch admin edit an entry someone else created on their branch", () => {
    expect(canEditEntry(entry(), branchAdmin)).toBe(true);
    expect(canEditEntry(entry(), member)).toBe(false);
  });

  it("reaches the Root's whole side, past the Branch's own blood", () => {
    expect(canEditEntry(entry({ id: "noorali" }), branchAdmin)).toBe(true);
    expect(canEditEntry(entry({ id: "noorali" }), member)).toBe(false);
  });

  it("keeps a branch admin off the other Root's side", () => {
    expect(canEditEntry(entry({ id: "minaz" }), branchAdmin)).toBe(false);
    expect(canEditEntry(entry({ id: "hussein" }), branchAdmin)).toBe(false);
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
    expect(canEditEntry(entry({ id: "noorali" }), admin)).toBe(true);
    expect(canEditEntry(entry({ isSomeoneElsesOwn: true }), admin)).toBe(true);
  });

  it("lets a Leaf edit their own entry and nothing else", () => {
    expect(canEditEntry(entry({ id: "arzu" }), leaf)).toBe(true);
    expect(canEditEntry(entry(), leaf)).toBe(false);
  });

  it("takes a Leaf's creator rights away with the rest", () => {
    // Added while they were Canopy: still theirs by owner and creator, but a
    // Leaf reaches their own entry alone.
    const addedEarlier = entry({
      id: "rehan",
      owner_user_id: "arzu-user",
      created_by: "arzu-user",
    });
    expect(canEditEntry(addedEarlier, member)).toBe(true);
    expect(canEditEntry(addedEarlier, leaf)).toBe(false);
  });

  it("gives a Leaf still onboarding nothing to edit", () => {
    const onboarding = { ...leaf, selfPersonId: null };
    expect(canEditEntry(entry({ id: "arzu" }), onboarding)).toBe(false);
  });

  it("reads an unknown role as a Leaf", () => {
    const unknown = { ...member, role: "gardener" };
    expect(canEditEntry(entry({ id: "arzu" }), unknown)).toBe(true);
    const addedEarlier = entry({ id: "rehan", owner_user_id: "arzu-user" });
    expect(canEditEntry(addedEarlier, unknown)).toBe(false);
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
    // Aalim is on Raiya's side as her husband; his mother is not.
    expect(canEditConnection(line("minaz", "aalim"), branchAdmin)).toBe(false);
    expect(canEditConnection(line("hussein", "minaz"), branchAdmin)).toBe(
      false,
    );
  });

  it("covers lines anywhere on the Root's side", () => {
    // Safia and her father are both Raiya's side, though neither is Arzu's blood.
    expect(canEditConnection(line("noorali", "safia"), branchAdmin)).toBe(true);
  });

  it("keeps the creator's own rights", () => {
    const mine = { ...line("noorali", "amyn"), created_by: "arzu-user" };
    expect(canEditConnection(mine, member)).toBe(true);
  });

  it("gives a Leaf no lines, not even ones they drew", () => {
    const drawn = { ...line("fatehali", "arzu"), created_by: "arzu-user" };
    expect(canEditConnection(drawn, member)).toBe(true);
    expect(canEditConnection(drawn, leaf)).toBe(false);
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
    const offBranch = { created_by: "raiya-user", companions: ["minaz"] };
    expect(
      canEditCompanion(offBranch, branchAdmin, editable(branchAdmin)),
    ).toBe(false);
  });

  it("gives a Leaf no companions, even one that lives with them", () => {
    const theirs = { created_by: "arzu-user", companions: ["arzu"] };
    expect(canEditCompanion(theirs, member, editable(member))).toBe(true);
    expect(canEditCompanion(theirs, leaf, editable(leaf))).toBe(false);
  });

  it("gives an admin every companion", () => {
    const pet = { created_by: "raiya-user", companions: ["noorali"] };
    expect(canEditCompanion(pet, admin, () => false)).toBe(true);
  });
});

describe("canSeeDocuments", () => {
  it("shows a Root every entry's documents", () => {
    expect(canSeeDocuments(entry({ id: "hussein" }), admin)).toBe(true);
  });

  it("shows the owner, and the member whose own entry it is", () => {
    const mine = entry({ id: "rehan", owner_user_id: "arzu-user" });
    expect(canSeeDocuments(mine, member)).toBe(true);
    expect(canSeeDocuments(mine, leaf)).toBe(true);
    expect(canSeeDocuments(entry({ id: "arzu" }), leaf)).toBe(true);
  });

  it("hides them from Canopy and Leaf members who don't own the entry", () => {
    expect(canSeeDocuments(entry(), member)).toBe(false);
    expect(canSeeDocuments(entry(), leaf)).toBe(false);
  });

  it("shows a Branch their Root's side, including members' own entries", () => {
    const raiya = entry({ id: "raiya", isSomeoneElsesOwn: true });
    expect(canEditEntry(raiya, branchAdmin)).toBe(false);
    expect(canSeeDocuments(raiya, branchAdmin)).toBe(true);
    expect(canSeeDocuments(entry({ id: "noorali" }), branchAdmin)).toBe(true);
    expect(canSeeDocuments(entry({ id: "minaz" }), branchAdmin)).toBe(false);
  });

  it("covers everyone who can edit the entry", () => {
    const ids = ["fatehali", "noorali", "minaz", "arzu", "rehan", "raiya"];
    for (const viewer of [admin, branchAdmin, member, leaf]) {
      for (const id of ids) {
        for (const owner of ["raiya-user", "arzu-user"]) {
          const e = entry({ id, owner_user_id: owner, created_by: owner });
          if (canEditEntry(e, viewer)) {
            expect(canSeeDocuments(e, viewer)).toBe(true);
          }
        }
      }
    }
  });
});
