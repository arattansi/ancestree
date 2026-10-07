/**
 * The admin page (Step 103): the beta reviewers' own page at `/admin`, in
 * tabs — the weekly newsletter, the engagement numbers, and what they
 * manage across the site, and the blog's drafts and posts (Step 134). Its
 * tabs are `?tab=` links; the first needs none.
 */

export const ADMIN_TABS = ["newsletter", "analytics", "manage", "blog"] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

/** The tab `?tab=` names, or the first for anything else. */
export function readAdminTab(raw: unknown): AdminTab {
  return typeof raw === "string" && (ADMIN_TABS as readonly string[]).includes(raw)
    ? (raw as AdminTab)
    : ADMIN_TABS[0];
}

/** The admin page, at `tab`. */
export function adminPageHref(tab: AdminTab = ADMIN_TABS[0]): string {
  return tab === ADMIN_TABS[0] ? "/admin" : `/admin?tab=${tab}`;
}
