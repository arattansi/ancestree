import { describe, expect, it } from "vitest";

import { QUEUE_SECTIONS } from "@/lib/admin-queue";
import { ADMIN_SECTION_IDS, adminNav, groupSectionIds } from "@/lib/admin-sections";

describe("adminNav", () => {
  it("lists a Root's sections under their groups' headings", () => {
    expect(adminNav()).toEqual([
      {
        label: null,
        items: [
          { id: "overview", label: "Overview" },
          { id: "tree-settings", label: "Settings" },
          { id: "members", label: "Members" },
          { id: "account-types", label: "Account Types" },
        ],
      },
      { label: "People", items: [{ id: "placements", label: "From Other Trees" }] },
      {
        label: "Requests & reports",
        items: [
          { id: "invite-requests", label: "Requests for Access" },
          { id: "reports", label: "Reports" },
        ],
      },
      {
        label: "Invites",
        items: [
          { id: "invite", label: "Invite a Relative" },
          { id: "family-link", label: "Family Link" },
          { id: "share", label: "Share a Link" },
          { id: "sent-invites", label: "Sent Invites" },
          { id: "archived-invites", label: "Archived" },
        ],
      },
    ]);
  });

  it("has no founder invites, bare links, settings, or requests to start a tree (Step 103)", () => {
    for (const gone of [
      "tree-requests",
      "found",
      "bare-invites",
      "tree-name",
      "visibility",
      "data-privacy",
      "nicknames",
      "view",
    ]) {
      expect(ADMIN_SECTION_IDS).not.toContain(gone);
    }
  });
});

describe("groupSectionIds", () => {
  it("opens a group for its own sections, not for the overview above it", () => {
    expect(groupSectionIds("members")).toEqual(["members", "account-types"]);
    expect(groupSectionIds("requests")).toEqual(["invite-requests", "reports"]);
  });
});

describe("ADMIN_SECTION_IDS", () => {
  it("knows every queue the header and alert emails open", () => {
    for (const section of QUEUE_SECTIONS) expect(ADMIN_SECTION_IDS).toContain(section);
  });
});
