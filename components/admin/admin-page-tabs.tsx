import { ToggleLink } from "@/components/account-view-toggle";
import { ADMIN_TABS, adminPageHref, type AdminTab } from "@/lib/admin-page";

/**
 * The admin page's tabs (Step 103): newsletter | analytics | manage, as
 * `?tab=` links drawn like the account page's views.
 */
export function AdminPageTabs({ tab }: { tab: AdminTab }) {
  return (
    <div
      role="group"
      aria-label="Admin view"
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5"
    >
      {ADMIN_TABS.map((t) => (
        <ToggleLink key={t} href={adminPageHref(t)} active={t === tab}>
          {t}
        </ToggleLink>
      ))}
    </div>
  );
}
