/**
 * The Root console's sections (Step 77.6, audit R8), listed once. The side
 * nav is drawn from them, and each group on the console opens itself when
 * the nav, or a `#hash`, points at one of its own; the console draws each
 * section's content where its group is laid out, and asks here whether a
 * section shows at all.
 */

export type AdminSectionContext = {
  /** A beta reviewer: requests to start a tree show on every console they run. */
  reviewer: boolean;
  /** Bare invite links are left from before the family link (Step 52). */
  bareInvites: boolean;
};

/** The console's groups, in order down the page. */
export type AdminGroupKey =
  | "members"
  | "people"
  | "requests"
  | "invites"
  | "settings";

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
  shown?: (ctx: AdminSectionContext) => boolean;
};

const GROUPS: readonly AdminGroupKey[] = [
  "members",
  "people",
  "requests",
  "invites",
  "settings",
];

/** The side nav's heading for each group; the first has none. */
const NAV_HEADINGS: Record<AdminGroupKey, string | null> = {
  members: null,
  people: "People",
  requests: "Requests & claims",
  invites: "Invites",
  settings: "Settings",
};

const SECTIONS: readonly AdminSection[] = [
  { id: "overview", nav: "Overview", group: "members", ownCard: true },
  { id: "members", nav: "Members", group: "members" },
  { id: "account-types", nav: "Account Types", group: "members" },
  { id: "placements", nav: "From Other Trees", group: "people" },
  { id: "invite-requests", nav: "Requests for Access", group: "requests" },
  { id: "disputes", nav: "Disputed Claims", group: "requests" },
  {
    id: "tree-requests",
    nav: "Requests to Start a Tree",
    group: "requests",
    shown: (ctx) => ctx.reviewer,
  },
  { id: "invite", nav: "Invite a Relative", group: "invites" },
  { id: "family-link", nav: "Family Link", group: "invites" },
  { id: "found", nav: "Invite Someone to Start a Tree", group: "invites" },
  { id: "share", nav: "Share a Link", group: "invites" },
  { id: "sent-invites", nav: "Sent Invites", group: "invites" },
  // Single-use bare links went with Step 52; shown while any are left.
  {
    id: "bare-invites",
    nav: "Bare Links",
    group: "invites",
    shown: (ctx) => ctx.bareInvites,
  },
  { id: "archived-invites", nav: "Archived", group: "invites" },
  { id: "tree-name", nav: "Tree Name", group: "settings" },
  { id: "visibility", nav: "Who Else Can View", group: "settings" },
  { id: "data-privacy", nav: "Data & Privacy", group: "settings" },
  { id: "nicknames", nav: "Nicknames", group: "settings" },
  { id: "view", nav: "View", group: "settings" },
];

function shownSections(ctx: AdminSectionContext): AdminSection[] {
  return SECTIONS.filter((s) => s.shown?.(ctx) ?? true);
}

/** Every section id the console has, whether or not it shows today. */
export const ADMIN_SECTION_IDS: readonly string[] = SECTIONS.map((s) => s.id);

/** Whether the console shows section `id` for this Root. */
export function sectionShown(id: string, ctx: AdminSectionContext): boolean {
  return shownSections(ctx).some((s) => s.id === id);
}

/** The side nav: each group's shown sections, under its heading. */
export function adminNav(ctx: AdminSectionContext): AdminNavGroup[] {
  const shown = shownSections(ctx);
  return GROUPS.map((group) => ({
    label: NAV_HEADINGS[group],
    items: shown
      .filter((s) => s.group === group)
      .map((s) => ({ id: s.id, label: s.nav })),
  })).filter((g) => g.items.length > 0);
}

/** The sections a group opens for: its own, as shown for this Root. */
export function groupSectionIds(
  group: AdminGroupKey,
  ctx: AdminSectionContext,
): string[] {
  return shownSections(ctx)
    .filter((s) => s.group === group && !s.ownCard)
    .map((s) => s.id);
}
