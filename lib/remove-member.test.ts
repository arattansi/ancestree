import { describe, expect, it } from "vitest";

import { memberRemovedToast, removeMemberConfirm } from "@/lib/remove-member";

const arzu = { name: "Arzu", treeName: "Rattansi" };

describe("removeMemberConfirm", () => {
  it("asks the question as the title, naming them and the tree", () => {
    expect(
      removeMemberConfirm({ ...arzu, entryCount: 3, onlyTree: true }).title,
    ).toBe("Remove Arzu from Rattansi?");
  });

  it("warns that their login goes when this is their only tree", () => {
    expect(
      removeMemberConfirm({ ...arzu, entryCount: 3, onlyTree: true }).description,
    ).toBe(
      "It’s their only tree, so their login goes too.\nTheir 3 entries become yours.\nThis cannot be undone.",
    );
  });

  it("says they keep their login when they're on another tree", () => {
    expect(
      removeMemberConfirm({ ...arzu, entryCount: 1, onlyTree: false }).description,
    ).toBe(
      "They stay on their other trees.\nTheir 1 entry becomes yours.\nThis cannot be undone.",
    );
  });

  it("holds either way when the console couldn't tell", () => {
    expect(
      removeMemberConfirm({ ...arzu, entryCount: 0, onlyTree: null }).description,
    ).toBe("If it’s their only tree, their login goes too.\nThis cannot be undone.");
  });

  it("leaves out the entries when they added none", () => {
    for (const onlyTree of [true, false, null]) {
      expect(
        removeMemberConfirm({ ...arzu, entryCount: 0, onlyTree }).description,
      ).not.toMatch(/becomes? yours/);
    }
  });

  it("ends on its own line that it cannot be undone", () => {
    for (const onlyTree of [true, false, null]) {
      const lines = removeMemberConfirm({ ...arzu, entryCount: 2, onlyTree })
        .description.split("\n");
      expect(lines.at(-1)).toBe("This cannot be undone.");
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
