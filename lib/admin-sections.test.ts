import { describe, expect, it } from "vitest";

import { QUEUE_SECTIONS } from "@/lib/admin-queue";
import {
  ADMIN_SECTION_IDS,
  adminNav,
  groupSectionIds,
  sectionShown,
} from "@/lib/admin-sections";

const ROOT = { reviewer: false, bareInvites: false };
const REVIEWER = { reviewer: true, bareInvites: false };

describe("adminNav", () => {
  it("lists a Root's sections under their groups' headings", () => {
    expect(adminNav(ROOT)).toEqual([
      {
        label: null,
        items: [
          { id: "overview", label: "Overview" },
          { id: "members", label: "Members" },
          { id: "account-types", label: "Account Types" },
        ],
      },
      { label: "People", items: [{ id: "placements", label: "From Other Trees" }] },
      {
        label: "Requests & claims",
        items: [
          { id: "invite-requests", label: "Requests for Access" },
          { id: "disputes", label: "Disputed Claims" },
        ],
      },
      {
        label: "Invites",
        items: [
          { id: "invite", label: "Invite a Relative" },
          { id: "family-link", label: "Family Link" },
          { id: "found", label: "Invite Someone to Start a Tree" },
          { id: "share", label: "Share a Link" },
          { id: "sent-invites", label: "Sent Invites" },
          { id: "archived-invites", label: "Archived" },
        ],
      },
      {
        label: "Settings",
        items: [
          { id: "tree-name", label: "Tree Name" },
          { id: "visibility", label: "Who Else Can View" },
          { id: "data-privacy", label: "Data & Privacy" },
          { id: "nicknames", label: "Nicknames" },
          { id: "view", label: "View" },
        ],
      },
    ]);
  });

  it("adds requests to start a tree for a beta reviewer, and bare links while any are left", () => {
    const ids = (ctx: typeof ROOT) => adminNav(ctx).flatMap((g) => g.items.map((i) => i.id));
    expect(ids(REVIEWER)).toContain("tree-requests");
    expect(ids(ROOT)).not.toContain("tree-requests");
    const withBare = ids({ ...ROOT, bareInvites: true });
    expect(withBare.slice(withBare.indexOf("sent-invites"), withBare.indexOf("sent-invites") + 3)).toEqual([
      "sent-invites",
      "bare-invites",
      "archived-invites",
    ]);
  });
});

describe("groupSectionIds", () => {
  it("opens a group for its own sections, not for the overview above it", () => {
    expect(groupSectionIds("members", ROOT)).toEqual(["members", "account-types"]);
    expect(groupSectionIds("requests", ROOT)).toEqual(["invite-requests", "disputes"]);
    expect(groupSectionIds("requests", REVIEWER)).toEqual([
      "invite-requests",
      "disputes",
      "tree-requests",
    ]);
  });
});

describe("sectionShown", () => {
  it("says whether this Root sees a section", () => {
    expect(sectionShown("tree-requests", ROOT)).toBe(false);
    expect(sectionShown("tree-requests", REVIEWER)).toBe(true);
    expect(sectionShown("bare-invites", { ...ROOT, bareInvites: true })).toBe(true);
    expect(sectionShown("share", ROOT)).toBe(true);
  });

  it("knows every queue the header and alert emails open", () => {
    for (const section of QUEUE_SECTIONS) expect(ADMIN_SECTION_IDS).toContain(section);
  });
});
