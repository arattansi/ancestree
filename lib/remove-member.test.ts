import { describe, expect, it } from "vitest";

import { memberRemovedToast, removeMemberConfirm } from "@/lib/remove-member";

const arzu = { name: "Arzu", treeName: "Rattansi" };

describe("removeMemberConfirm", () => {
  it("warns that their login goes when this is their only tree", () => {
    expect(removeMemberConfirm({ ...arzu, entryCount: 3, onlyTree: true })).toBe(
      "Remove Arzu from Rattansi? It’s their only tree, so their login is deleted too and they can’t return without a new invite. Their 3 entries and anything else they added become yours. This cannot be undone.",
    );
  });

  it("says they keep their login when they're on another tree", () => {
    expect(removeMemberConfirm({ ...arzu, entryCount: 1, onlyTree: false })).toBe(
      "Remove Arzu from Rattansi? They keep their login and stay on their other trees. Their 1 entry and anything else they added become yours. This cannot be undone.",
    );
  });

  it("holds either way when the console couldn't tell", () => {
    expect(removeMemberConfirm({ ...arzu, entryCount: 0, onlyTree: null })).toBe(
      "Remove Arzu from Rattansi? If it’s their only tree, their login is deleted too and they can’t return without a new invite. This cannot be undone.",
    );
  });

  it("leaves out the entries when they added none", () => {
    for (const onlyTree of [true, false, null]) {
      expect(
        removeMemberConfirm({ ...arzu, entryCount: 0, onlyTree }),
      ).not.toContain("become yours");
    }
  });
});

describe("memberRemovedToast", () => {
  it("says their login went with their last tree", () => {
    expect(memberRemovedToast({ ...arzu, loginDeleted: true })).toBe(
      "Removed Arzu from Rattansi. Their login was deleted too.",
    );
  });

  it("says they're still on their other trees otherwise", () => {
    expect(memberRemovedToast({ ...arzu, loginDeleted: false })).toBe(
      "Removed Arzu from Rattansi. They’re still on their other trees.",
    );
  });

  it("reads right for a member with no display name", () => {
    expect(
      memberRemovedToast({ name: "this member", treeName: "Rattansi", loginDeleted: true }),
    ).toBe("Removed this member from Rattansi. Their login was deleted too.");
  });
});
