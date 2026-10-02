/**
 * The Root console's sections (Step 77.6, audit R8), listed once. The side
 * nav is drawn from them, and each group on the console opens itself when
 * the nav, or a `#hash`, points at one of its own; the console draws each
 * section's content where its group is laid out. The tree's own settings
 * went to the account page's settings view in Step 103.2 and came back as
 * a card beside the overview in Step 109.
 */

/** The console's groups, in order down the page. */
export type AdminGroupKey = "members" | "people" | "requests" | "invites";

export type AdminNavItem = { id: string; label: string };
/** A `label` of `null` renders the items flush, with no group heading. */
export type AdminNavGroup = { label: string | null; items: AdminNavItem[] };

type AdminSection = {
  id: string;
  /** Its name in the side nav, often shorter than its title. */
  nav: string;
  group: AdminGroupKey;
  /** A card of its own above the group, not a section the group opens. */
  ownCard?: boolean;
};

const GROUPS: readonly AdminGroupKey[] = [
  "members",
  "people",
  "requests",
  "invites",
];

/** The side nav's heading for each group; the first has none. */
const NAV_HEADINGS: Record<AdminGroupKey, string | null> = {
  members: null,
  people: "People",
  requests: "Requests & reports",
  invites: "Invites",
};

const SECTIONS: readonly AdminSection[] = [
  { id: "overview", nav: "Overview", group: "members", ownCard: true },
  { id: "tree-settings", nav: "Settings", group: "members", ownCard: true },
  { id: "members", nav: "Members", group: "members" },
  { id: "account-types", nav: "Account Types", group: "members" },
  { id: "placements", nav: "From Other Trees", group: "people" },
  { id: "invite-requests", nav: "Requests for Access", group: "requests" },
  { id: "reports", nav: "Reports", group: "requests" },
  { id: "invite", nav: "Invite a Relative", group: "invites" },
  { id: "family-link", nav: "Family Link", group: "invites" },
  { id: "share", nav: "Share a Link", group: "invites" },
  { id: "sent-invites", nav: "Sent Invites", group: "invites" },
  { id: "archived-invites", nav: "Archived", group: "invites" },
];

/** Every section id the console has. */
export const ADMIN_SECTION_IDS: readonly string[] = SECTIONS.map((s) => s.id);

/** The side nav: each group's sections, under its heading. */
export function adminNav(): AdminNavGroup[] {
  return GROUPS.map((group) => ({
    label: NAV_HEADINGS[group],
    items: SECTIONS.filter((s) => s.group === group).map((s) => ({
      id: s.id,
      label: s.nav,
    })),
  }));
}

/** The sections a group opens for: its own. */
export function groupSectionIds(group: AdminGroupKey): string[] {
  return SECTIONS.filter((s) => s.group === group && !s.ownCard).map(
    (s) => s.id,
  );
}
