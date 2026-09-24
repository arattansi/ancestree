import { describe, expect, it } from "vitest";

import {
  branchIds,
  branchReach,
  canAddRelativeOf,
  canEditCompanion,
  canEditConnection,
  canEditEntry,
  canFillEntry,
  canInviteToClaim,
  canOfferDelete,
  canSeeDocuments,
  lineIds,
  ownRoots,
  relatedRoots,
  rootSideIds,
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
const sibling = (a: string, b: string): BranchEdge => ({
  from_person: a,
  to_person: b,
  type: "sibling",
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

describe("ownRoots", () => {
  it("puts a Root on their own side, not their partner's", () => {
    // Married to each other, each Root is on both branches by marriage.
    expect(relatedRoots("aalim", roots, family)).toEqual(["raiya", "aalim"]);
    expect(ownRoots("aalim", roots, family)).toEqual(["aalim"]);
    expect(ownRoots("raiya", roots, family)).toEqual(["raiya"]);
  });

  it("finds the Root a relative is blood to", () => {
    expect(ownRoots("arzu", roots, family)).toEqual(["raiya"]);
    expect(ownRoots("hussein", roots, family)).toEqual(["aalim"]);
    // Raiya's mother's brother: blood to Raiya through her mother.
    expect(ownRoots("amyn", roots, family)).toEqual(["raiya"]);
  });

  it("falls back to the side someone married into", () => {
    expect(ownRoots("shireen", roots, family)).toEqual(["raiya"]);
  });

  it("finds both Roots for their child", () => {
    const edges = [...family, parent("raiya", "zara"), parent("aalim", "zara")];
    expect(ownRoots("zara", roots, edges)).toEqual(["raiya", "aalim"]);
  });

  it("finds none for someone tied on only through an in-law", () => {
    const edges = [
      ...family,
      spouse("amyn", "yasmin"),
      parent("yasmin-mum", "yasmin"),
    ];
    expect(ownRoots("yasmin-mum", roots, edges)).toEqual([]);
  });
});

describe("rootSideIds", () => {
  it("is the branch of the Root they're blood to", () => {
    expect(rootSideIds("arzu", roots, family)).toEqual(
      branchIds("raiya", family),
    );
    expect(rootSideIds("hussein", roots, family)).toEqual(
      branchIds("aalim", family),
    );
  });

  it("gives a Root their own side, their partner included", () => {
    expect(rootSideIds("aalim", roots, family)).toEqual(
      new Set(["aalim", "minaz", "hussein", "raiya"]),
    );
    // Not the partner's family.
    expect(rootSideIds("aalim", roots, family).has("ashif")).toBe(false);
  });

  it("joins both sides for a child of two Roots", () => {
    const edges = [...family, parent("raiya", "zara"), parent("aalim", "zara")];
    const side = rootSideIds("zara", roots, edges);
    expect(side.has("noorali")).toBe(true);
    expect(side.has("hussein")).toBe(true);
  });

  it("is empty when related to no Root", () => {
    expect(rootSideIds("nobody", roots, family).size).toBe(0);
    expect(rootSideIds("arzu", [], family).size).toBe(0);
  });
});

describe("branchReach", () => {
  it("tends the part of the Root's side they're related through", () => {
    const reach = branchReach("arzu", roots, family);
    expect(reach).toEqual(branchIds("arzu", family));
    // Raiya's mother's family: on Raiya's side, but not the part Arzu is
    // related through (Step 22.2 takes back what 18.1 gave).
    expect(branchIds("raiya", family).has("noorali")).toBe(true);
    expect(reach.has("noorali")).toBe(false);
    expect(reach.has("kulsum")).toBe(false);
    expect(reach.has("amyn")).toBe(false);
    // Raiya's mother married in, so she is still Arzu's to tend.
    expect(reach.has("safia")).toBe(true);
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

  it("stops a cousin at the Root's side, however far their own blood runs", () => {
    // Rehan is Raiya's cousin; his own branch runs into Shireen's family,
    // which is nothing to Raiya.
    const edges = [
      ...family,
      parent("shireen-dad", "shireen"),
      parent("shireen-dad", "shireen-bro"),
    ];
    const reach = branchReach("rehan", roots, edges);
    expect(reach.has("fatehali")).toBe(true);
    expect(reach.has("shireen")).toBe(true);
    expect(reach.has("shireen-bro")).toBe(false);
    // And not Raiya's mother's family either: Rehan isn't related through it.
    expect(reach.has("noorali")).toBe(false);
  });

  it("tends only the married-in corner for a Branch who married in", () => {
    // Shireen is on Raiya's side as Arzu's wife. Her own family is not.
    const edges = [...family, parent("shireen-dad", "shireen")];
    const reach = branchReach("shireen", roots, edges);
    expect(reach).toEqual(new Set(["shireen", "arzu", "rehan"]));
  });

  it("tends nothing when related to no Root", () => {
    expect(branchReach("nobody", roots, family).size).toBe(0);
    expect(branchReach("arzu", [], family).size).toBe(0);
  });
});

describe("lineIds", () => {
  it("is the branch walk from them when no sibling stands alone", () => {
    expect(lineIds("rehan", family)).toEqual(branchIds("rehan", family));
    expect(lineIds("aalim", family)).toEqual(branchIds("aalim", family));
  });

  it("grows as a Leaf adds ancestors, and their other children after", () => {
    // Aly, Aalim's sister, adds their great-grandparent, then a great-uncle.
    const edges = [
      ...family,
      parent("minaz", "aly"),
      parent("hussein-dad", "hussein"),
      parent("hussein-dad", "great-uncle"),
    ];
    const line = lineIds("aly", edges);
    expect(line.has("hussein-dad")).toBe(true);
    expect(line.has("great-uncle")).toBe(true);
    // Her brother, and the wife he married, are on it too.
    expect(line.has("aalim")).toBe(true);
    expect(line.has("raiya")).toBe(true);
  });

  it("stops at a partner instead of walking into their family", () => {
    const line = lineIds("aalim", family);
    expect(line.has("raiya")).toBe(true);
    expect(line.has("ashif")).toBe(false);
    expect(line.has("safia")).toBe(false);
    expect(line.has("fatehali")).toBe(false);
  });

  it("counts a brother or sister recorded without the parents they share", () => {
    const edges = [
      ...family,
      sibling("aalim", "aly"),
      parent("aly", "aly-son"),
      spouse("aly", "aly-husband"),
    ];
    const line = lineIds("aalim", edges);
    expect(line.has("aly")).toBe(true);
    expect(line.has("aly-son")).toBe(true);
    expect(line.has("aly-husband")).toBe(true);
    // From Aly it reaches her brother, but never climbs through him: nothing
    // says his mother is hers too, and a half-brother's needn't be.
    expect(lineIds("aly", edges).has("aalim")).toBe(true);
    expect(lineIds("aly", edges).has("minaz")).toBe(false);
  });

  it("counts an ancestor's brothers and sisters, and their families", () => {
    const edges = [
      ...family,
      sibling("hussein", "great-aunt"),
      parent("great-aunt", "second-cousin-parent"),
    ];
    const line = lineIds("aalim", edges);
    expect(line.has("great-aunt")).toBe(true);
    expect(line.has("second-cousin-parent")).toBe(true);
  });

  it("keeps a cousin's half-brother through their other parent off it", () => {
    // Raiya is Rehan's cousin. A brother of hers recorded only as a sibling
    // might be Safia's son alone: no blood of Rehan's.
    const edges = [...family, sibling("raiya", "raiya-half-brother")];
    expect(lineIds("rehan", edges).has("raiya-half-brother")).toBe(false);
    expect(lineIds("raiya", edges).has("raiya-half-brother")).toBe(true);
  });

  it("gives a person with no connections a line of one", () => {
    expect(lineIds("nobody", family)).toEqual(new Set(["nobody"]));
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
  line: null,
  ownLine: lineIds("arzu", family),
};
/** Arzu as a Leaf: what they added, their own entry, and their own line to grow. */
const member: Viewer = {
  userId: "arzu-user",
  role: "member",
  selfPersonId: "arzu",
  branch: null,
  line: lineIds("arzu", family),
  ownLine: lineIds("arzu", family),
};
const admin: Viewer = {
  userId: "a",
  role: "admin",
  selfPersonId: null,
  branch: null,
  line: null,
  ownLine: null,
};

describe("canEditEntry", () => {
  it("lets a branch admin edit an entry someone else created on their branch", () => {
    expect(canEditEntry(entry(), branchAdmin)).toBe(true);
    expect(canEditEntry(entry(), member)).toBe(false);
  });

  it("reaches the part of the Root's side they're related through", () => {
    expect(canEditEntry(entry({ id: "safia" }), branchAdmin)).toBe(true);
    // Raiya's mother's father: Raiya's side, not Arzu's part of it.
    expect(canEditEntry(entry({ id: "noorali" }), branchAdmin)).toBe(false);
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

  it("lets everyone edit their own entry, whoever added it", () => {
    for (const viewer of [branchAdmin, member]) {
      expect(canEditEntry(entry({ id: "arzu" }), viewer)).toBe(true);
    }
    expect(canEditEntry(entry(), member)).toBe(false);
  });

  it("gives a member still onboarding only what they added", () => {
    const onboarding = {
      ...member,
      selfPersonId: null,
      line: null,
      ownLine: null,
    };
    expect(canEditEntry(entry({ id: "arzu" }), onboarding)).toBe(false);
    const mine = entry({ owner_user_id: "arzu-user", created_by: "arzu-user" });
    expect(canEditEntry(mine, onboarding)).toBe(true);
  });

  it("reads an unknown role, like the retired Leaf's, as a Leaf", () => {
    for (const role of ["gardener", "leaf"]) {
      const unknown = { ...member, role };
      expect(canEditEntry(entry({ id: "arzu" }), unknown)).toBe(true);
      const addedEarlier = entry({ id: "rehan", owner_user_id: "arzu-user" });
      expect(canEditEntry(addedEarlier, unknown)).toBe(true);
      expect(canEditEntry(entry(), unknown)).toBe(false);
    }
  });
});

describe("canInviteToClaim", () => {
  const mine = entry({
    id: "minaz",
    owner_user_id: "arzu-user",
    created_by: "arzu-user",
  });

  it("lets a Root invite someone to claim any unclaimed entry", () => {
    expect(canInviteToClaim(entry(), admin)).toBe(true);
    expect(canInviteToClaim(entry({ id: "minaz" }), admin)).toBe(true);
  });

  it("lets a Branch reach their side, and what they added off it", () => {
    expect(canInviteToClaim(entry(), branchAdmin)).toBe(true);
    expect(canInviteToClaim(entry({ id: "minaz" }), branchAdmin)).toBe(false);
    expect(canInviteToClaim(mine, branchAdmin)).toBe(true);
  });

  it("keeps a Leaf to the entries they added", () => {
    expect(canInviteToClaim(mine, member)).toBe(true);
    expect(canInviteToClaim(entry(), member)).toBe(false);
    expect(canInviteToClaim(entry({ id: "arzu" }), member)).toBe(false);
  });

  it("refuses an entry somebody is already behind", () => {
    for (const viewer of [admin, branchAdmin]) {
      expect(canInviteToClaim(entry({ isClaimed: true }), viewer)).toBe(false);
      expect(canInviteToClaim(entry({ isSomeoneElsesOwn: true }), viewer)).toBe(
        false,
      );
      // Handed over without a claim row: the owner moved off the creator.
      expect(
        canInviteToClaim(entry({ owner_user_id: "someone-else" }), viewer),
      ).toBe(false);
    }
  });

  it("refuses someone who has died", () => {
    expect(canInviteToClaim(entry({ isDeceased: true }), admin)).toBe(false);
    expect(canInviteToClaim({ ...mine, isDeceased: true }, member)).toBe(false);
  });

  it("refuses the viewer's own entry", () => {
    expect(
      canInviteToClaim(entry({ id: "arzu" }), {
        ...admin,
        selfPersonId: "arzu",
      }),
    ).toBe(false);
    expect(canInviteToClaim(entry({ id: "arzu" }), branchAdmin)).toBe(false);
  });
});

describe("canOfferDelete", () => {
  const mine = entry({
    id: "minaz",
    owner_user_id: "arzu-user",
    created_by: "arzu-user",
  });

  it("offers a Root every entry", () => {
    expect(canOfferDelete(entry(), admin)).toBe(true);
    expect(canOfferDelete(entry({ isClaimed: true }), admin)).toBe(true);
  });

  it("offers a Branch and a Leaf only the entries they added", () => {
    for (const viewer of [branchAdmin, member]) {
      expect(canOfferDelete(mine, viewer)).toBe(true);
      // On the Branch's side, but a Root added it: editable, not deletable.
      expect(canOfferDelete(entry(), viewer)).toBe(false);
    }
  });

  it("stops offering once somebody is behind the entry", () => {
    expect(canOfferDelete({ ...mine, isClaimed: true }, member)).toBe(false);
    expect(canOfferDelete({ ...mine, isSomeoneElsesOwn: true }, member)).toBe(
      false,
    );
    expect(
      canOfferDelete({ ...mine, owner_user_id: "someone-else" }, member),
    ).toBe(false);
  });

  it("never offers anyone their own entry", () => {
    for (const viewer of [branchAdmin, member]) {
      expect(canOfferDelete({ ...mine, id: "arzu" }, viewer)).toBe(false);
    }
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

  it("covers lines on their part of the Root's side, and no further", () => {
    // Safia married Arzu's brother: on Arzu's part, though not Arzu's blood.
    expect(canEditConnection(line("ashif", "safia"), branchAdmin)).toBe(true);
    // Her father is Raiya's side but not Arzu's part of it.
    expect(canEditConnection(line("noorali", "safia"), branchAdmin)).toBe(
      false,
    );
  });

  it("keeps the creator's own rights", () => {
    const mine = { ...line("noorali", "amyn"), created_by: "arzu-user" };
    expect(canEditConnection(mine, member)).toBe(true);
    const drawn = { ...line("fatehali", "arzu"), created_by: "arzu-user" };
    expect(canEditConnection(drawn, member)).toBe(true);
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

  it("lets a Leaf edit a companion that lives with them", () => {
    const theirs = { created_by: "raiya-user", companions: ["arzu"] };
    expect(canEditCompanion(theirs, member, editable(member))).toBe(true);
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
    expect(canSeeDocuments(entry({ id: "arzu" }), member)).toBe(true);
  });

  it("hides them from a Leaf who doesn't own the entry", () => {
    expect(canSeeDocuments(entry(), member)).toBe(false);
  });

  it("shows a Branch their part of the Root's side, including members' own entries", () => {
    const raiya = entry({ id: "raiya", isSomeoneElsesOwn: true });
    expect(canEditEntry(raiya, branchAdmin)).toBe(false);
    expect(canSeeDocuments(raiya, branchAdmin)).toBe(true);
    expect(canSeeDocuments(entry({ id: "safia" }), branchAdmin)).toBe(true);
    expect(canSeeDocuments(entry({ id: "noorali" }), branchAdmin)).toBe(false);
    expect(canSeeDocuments(entry({ id: "minaz" }), branchAdmin)).toBe(false);
  });

  it("covers everyone who can edit the entry", () => {
    const ids = ["fatehali", "noorali", "minaz", "arzu", "rehan", "raiya"];
    for (const viewer of [admin, branchAdmin, member]) {
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

describe("canAddRelativeOf", () => {
  it("lets a Root or a Branch add from anyone", () => {
    for (const viewer of [admin, branchAdmin]) {
      expect(canAddRelativeOf("hussein", viewer)).toBe(true);
      expect(canAddRelativeOf("noorali", viewer)).toBe(true);
    }
  });

  it("keeps a Leaf to their own line", () => {
    // Arzu's line: their blood, and whoever it married, Aalim included.
    expect(canAddRelativeOf("karmali", member)).toBe(true);
    expect(canAddRelativeOf("rehan", member)).toBe(true);
    expect(canAddRelativeOf("aalim", member)).toBe(true);
    // Aalim's mother and Safia's father are someone else's line.
    expect(canAddRelativeOf("minaz", member)).toBe(false);
    expect(canAddRelativeOf("noorali", member)).toBe(false);
  });

  it("offers a Leaf nothing to add from until their own entry is on the tree", () => {
    const onboarding = {
      ...member,
      selfPersonId: null,
      line: null,
      ownLine: null,
    };
    expect(canAddRelativeOf("arzu", onboarding)).toBe(false);
  });
});

describe("canFillEntry (Step 44)", () => {
  it("lets a Leaf fill in an unclaimed entry on their own line", () => {
    // Fatehali, Arzu's father, added by Raiya: not Arzu's to edit.
    expect(canEditEntry(entry(), member)).toBe(false);
    expect(canFillEntry(entry(), member)).toBe(true);
    // Safia married Arzu's brother, so she is on the line too.
    expect(canFillEntry(entry({ id: "safia" }), member)).toBe(true);
  });

  it("keeps a Leaf to their own line", () => {
    // Safia's father and Aalim's mother are someone else's line.
    expect(canFillEntry(entry({ id: "noorali" }), member)).toBe(false);
    expect(canFillEntry(entry({ id: "minaz" }), member)).toBe(false);
  });

  it("leaves a claimed entry, or a member's own, to them", () => {
    expect(canFillEntry(entry({ isClaimed: true }), member)).toBe(false);
    const raiya = entry({ id: "raiya", isSomeoneElsesOwn: true });
    expect(canFillEntry(raiya, member)).toBe(false);
    expect(canFillEntry(raiya, branchAdmin)).toBe(false);
  });

  it("lets a Branch fill in past their side, on their own line", () => {
    // Rehan as a Branch tends Raiya's father's family. His mother Shireen
    // married in, so her mother is on his line but not on Raiya's side.
    const edges = [...family, parent("shireen-mum", "shireen")];
    const rehan: Viewer = {
      userId: "rehan-user",
      role: "branch_admin",
      selfPersonId: "rehan",
      branch: branchReach("rehan", roots, edges),
      line: null,
      ownLine: lineIds("rehan", edges),
    };
    const shireenMum = entry({ id: "shireen-mum" });
    expect(canEditEntry(shireenMum, rehan)).toBe(false);
    expect(canFillEntry(shireenMum, rehan)).toBe(true);
    // Off his line, still nothing.
    expect(canFillEntry(entry({ id: "noorali" }), rehan)).toBe(false);
  });

  it("gives a Root nothing to fill in: they edit everything", () => {
    expect(canFillEntry(entry(), admin)).toBe(false);
    expect(canEditEntry(entry(), admin)).toBe(true);
  });

  it("offers nothing until their own entry is on the tree", () => {
    const onboarding = {
      ...member,
      selfPersonId: null,
      line: null,
      ownLine: null,
    };
    expect(canFillEntry(entry(), onboarding)).toBe(false);
  });
});
