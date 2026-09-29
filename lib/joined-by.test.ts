import { describe, expect, it } from "vitest";

import { joinedByPerson, joinedByTags } from "@/lib/joined-by";

const member = (
  id: string,
  name: string | null,
  self: string | null,
  inviter: string | null = null,
  inviterName: string | null = null,
) => ({
  auth_user_id: id,
  display_name: name,
  self_person_id: self,
  invited_by_user_id: inviter,
  invited_by_name: inviterName,
});

describe("joinedByPerson", () => {
  const root = member("u-root", "Aalim", "p-root");
  const branch = member("u-branch", "Raiya", "p-branch", "u-root", "Aalim");

  it("names who added an entry nobody has", () => {
    const out = joinedByPerson([{ id: "p1", created_by: "u-root" }], [root], []);
    expect(out.get("p1")).toEqual({
      addedBy: { id: "u-root", name: "Aalim" },
      invitedBy: null,
    });
  });

  it("keeps both when one added the entry and another invited them", () => {
    const cousin = member("u-cousin", "Arzu", null, "u-branch", "Raiya");
    const out = joinedByPerson(
      [{ id: "p-cousin", created_by: "u-root" }],
      [root, branch, cousin],
      [{ person_id: "p-cousin", claimant_user_id: "u-cousin" }],
    );
    expect(out.get("p-cousin")).toEqual({
      addedBy: { id: "u-root", name: "Aalim" },
      invitedBy: { id: "u-branch", name: "Raiya" },
    });
  });

  it("doesn't say a member added their own entry", () => {
    const out = joinedByPerson(
      [
        { id: "p-branch", created_by: "u-branch" },
        { id: "p-root", created_by: "u-root" },
      ],
      [root, branch],
      [],
    );
    expect(out.get("p-branch")).toEqual({
      addedBy: null,
      invitedBy: { id: "u-root", name: "Aalim" },
    });
    // A founder: nobody added or invited them.
    expect(out.has("p-root")).toBe(false);
  });

  it("names a creator off the directory from their profile, or not at all", () => {
    const out = joinedByPerson(
      [
        { id: "p1", created_by: "u-gone" },
        { id: "p2", created_by: "u-unknown" },
        { id: "p3", created_by: "" },
      ],
      [root],
      [],
      new Map([["u-gone", "Shishang"]]),
    );
    expect(out.get("p1")?.addedBy).toEqual({ id: "u-gone", name: "Shishang" });
    expect(out.has("p2")).toBe(false);
    expect(out.has("p3")).toBe(false);
  });

  it("prefers a member's own entry over a claim", () => {
    const out = joinedByPerson(
      [{ id: "p-branch", created_by: "u-root" }],
      [root, branch, member("u-other", "Other", null, "u-root", "Aalim")],
      [{ person_id: "p-branch", claimant_user_id: "u-other" }],
    );
    expect(out.get("p-branch")?.invitedBy).toEqual({
      id: "u-root",
      name: "Aalim",
    });
  });
});

describe("joinedByTags", () => {
  const aalim = { id: "u-root", name: "Aalim" };
  const raiya = { id: "u-branch", name: "Raiya" };

  it("says both when they differ", () => {
    expect(
      joinedByTags({ addedBy: aalim, invitedBy: raiya }, "u-x").map(
        (t) => t.label,
      ),
    ).toEqual(["Added by Aalim", "Invited by Raiya"]);
  });

  it("says it once when it's the same person", () => {
    expect(joinedByTags({ addedBy: aalim, invitedBy: aalim }, "u-x")).toEqual([
      { kind: "added", label: "Added and invited by Aalim" },
    ]);
  });

  it("calls the viewer you", () => {
    expect(
      joinedByTags({ addedBy: aalim, invitedBy: null }, "u-root")[0].label,
    ).toBe("Added by you");
    expect(
      joinedByTags({ addedBy: null, invitedBy: raiya }, "u-branch")[0].label,
    ).toBe("Invited by you");
  });

  it("has nothing to say without them", () => {
    expect(joinedByTags(null, "u-x")).toEqual([]);
  });
});
