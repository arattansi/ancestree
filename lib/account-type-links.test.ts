import { describe, expect, it } from "vitest";

import { accountTypesByPerson } from "@/lib/account-type-links";

describe("accountTypesByPerson", () => {
  it("marks a member's own entry from their profile, with no claim", () => {
    const map = accountTypesByPerson(
      [{ auth_user_id: "u1", role: "admin", self_person_id: "p1" }],
      [],
    );
    expect(map.get("p1")).toBe("admin");
  });

  it("marks a claimed entry with the claimant's type", () => {
    const map = accountTypesByPerson(
      [{ auth_user_id: "u2", role: "member", self_person_id: null }],
      [{ person_id: "p2", claimant_user_id: "u2" }],
    );
    expect(map.get("p2")).toBe("member");
  });

  it("leaves a retired type's key unmarked", () => {
    // `leaf` was the first Leaf's key until Step 34; nobody holds it now.
    const map = accountTypesByPerson(
      [{ auth_user_id: "u2", role: "leaf", self_person_id: "p2" }],
      [],
    );
    expect(map.has("p2")).toBe(false);
  });

  it("leaves everyone else unmarked", () => {
    const map = accountTypesByPerson(
      [{ auth_user_id: "u1", role: "member", self_person_id: "p1" }],
      [],
    );
    expect(map.has("p9")).toBe(false);
    expect(map.size).toBe(1);
  });

  it("prefers the profile link when a claim names someone else", () => {
    const map = accountTypesByPerson(
      [
        { auth_user_id: "u1", role: "branch_admin", self_person_id: "p1" },
        { auth_user_id: "u2", role: "member", self_person_id: null },
      ],
      [{ person_id: "p1", claimant_user_id: "u2" }],
    );
    expect(map.get("p1")).toBe("branch_admin");
  });

  it("skips an unknown role and a claim from an unreadable profile", () => {
    const map = accountTypesByPerson(
      [{ auth_user_id: "u1", role: "owner", self_person_id: "p1" }],
      [{ person_id: "p2", claimant_user_id: "ghost" }],
    );
    expect(map.size).toBe(0);
  });
});
