import { ToggleLink } from "@/components/account-view-toggle";
import { ADMIN_TABS, adminPageHref, type AdminTab } from "@/lib/admin-page";

/**
 * The admin page's tabs (Step 103): newsletter | analytics | manage, as
 * `?tab=` links drawn like the account page's views. A tab with something
 * waiting on a reviewer counts it (the blog's stories and changes sent in,
 * Step 157).
 */
export function AdminPageTabs({
  tab,
  waiting = {},
}: {
  tab: AdminTab;
  waiting?: Partial<Record<AdminTab, number>>;
}) {
  return (
    <div
      role="group"
      aria-label="Admin view"
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5"
    >
      {ADMIN_TABS.map((t) => (
        <ToggleLink key={t} href={adminPageHref(t)} active={t === tab}>
          {t}
          {waiting[t] ? (
            <span className="ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white tabular-nums">
              {waiting[t]}
              <span className="sr-only"> waiting</span>
            </span>
          ) : null}
        </ToggleLink>
      ))}
    </div>
  );
}
