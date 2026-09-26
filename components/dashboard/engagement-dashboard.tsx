import { WeeklyActiveChart } from "@/components/dashboard/weekly-active-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ACTIVITY_GROUPS,
  NOTED_FROM,
  PROGRESS_ROWS,
  dayWithYear,
  headlineTiles,
  lastActiveLabel,
  percentOf,
  shortDay,
  weekRange,
  weeksSinceFirstActivity,
  type Dashboard,
} from "@/lib/dashboard";
import { loadDashboard } from "@/lib/dashboard.server";

/**
 * The beta reviewers' dashboard (Step 56) — the "dashboard" view of the
 * account page: how much ancestree is used across every tree, in counts
 * that never name anyone. The account page shows it only to a reviewer,
 * and `engagement_dashboard()` answers nobody else.
 */
export async function EngagementDashboard() {
  const dashboard = await loadDashboard();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Engagement</h2>
        <p className="text-sm text-muted-foreground">
          Every tree, in counts that name nobody. Only beta reviewers see this.
        </p>
      </div>
      {dashboard ? (
        <DashboardView d={dashboard} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Couldn&rsquo;t Load the Numbers</CardTitle>
            <CardDescription>Try again in a moment.</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

/** The cards, for a dashboard that has loaded. */
export function DashboardView({ d }: { d: Dashboard }) {
  const weeks = weeksSinceFirstActivity(d.weeks);
  const cell = "px-4 py-2 text-right tabular-nums";

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>
            The last 7 days are today and the 6 before, in UTC.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {headlineTiles(d).map((tile) => (
              <div
                key={tile.label}
                className="flex flex-col gap-1 rounded-lg border border-border p-3"
              >
                <dt className="text-xs font-medium text-muted-foreground">
                  {tile.label}
                </dt>
                <dd className="text-2xl font-semibold">{tile.value}</dd>
                <dd className="text-xs text-muted-foreground">{tile.note}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members Active Each Week</CardTitle>
          <CardDescription>
            Who used ancestree on any day of the week. Before{" "}
            {shortDay(NOTED_FROM)}, only a day they signed in or added
            something counts.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <WeeklyActiveChart weeks={weeks} />
          <details className="text-sm">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Show the numbers
            </summary>
            <div className="-mx-(--card-spacing) overflow-x-auto pt-2">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Members active, members joined and entries added, week by
                  week
                </caption>
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th scope="col" className="px-4 py-2 text-left font-medium">
                      Week
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Active
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Joined
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Entries added
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...weeks].reverse().map((w) => (
                    <tr
                      key={w.end}
                      className="border-b border-border last:border-0"
                    >
                      <th scope="row" className="px-4 py-2 text-left font-normal">
                        {weekRange(w.end)}
                      </th>
                      <td className={cell}>{w.active}</td>
                      <td className={cell}>{w.joined}</td>
                      <td className={cell}>{w.entries}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How Far Members Have Got</CardTitle>
          <CardDescription>
            Of {d.members} {d.members === 1 ? "member" : "members"}, how many
            have done each at least once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {PROGRESS_ROWS.map(({ key, label }) => {
              const n = d.progress[key];
              return (
                <li key={key} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span>{label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {n} of {d.members}
                    </span>
                  </div>
                  <div
                    aria-hidden
                    className="h-2 overflow-hidden rounded-full bg-chart-1/15"
                  >
                    <div
                      className="h-full rounded-full bg-chart-1"
                      style={{ width: `${percentOf(n, d.members)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What Members Did</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="-mx-(--card-spacing) overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                What members did in the last 7 days, the week before, and
                ever
              </caption>
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    <span className="sr-only">Activity</span>
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Last 7 days
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Week before
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    All time
                  </th>
                </tr>
              </thead>
              {ACTIVITY_GROUPS.map((group) => (
                <tbody key={group.title}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={4}
                      className="px-4 pt-4 pb-1 text-left text-xs font-medium text-muted-foreground"
                    >
                      {group.title}
                    </th>
                  </tr>
                  {group.rows.map(({ kind, label }) => {
                    const c = d.activity[kind];
                    return (
                      <tr
                        key={kind}
                        className="border-b border-border last:border-0"
                      >
                        <th
                          scope="row"
                          className="px-4 py-2 text-left font-normal"
                        >
                          {label}
                        </th>
                        <td className={cell}>{c.last7}</td>
                        <td className={`${cell} text-muted-foreground`}>
                          {c.prev7}
                        </td>
                        <td className={`${cell} text-muted-foreground`}>
                          {c.total}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trees</CardTitle>
          <CardDescription>
            Active and Added are the last 7 days. A member active on any tree
            counts on each of theirs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {d.trees.length === 0 ? (
            <p className="text-muted-foreground">No trees yet.</p>
          ) : (
            <div className="-mx-(--card-spacing) overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Each tree&rsquo;s members, members active in the last 7
                  days, entries, entries added in the last 7 days, and when
                  its members were last active
                </caption>
                <thead>
                  <tr className="border-b border-border whitespace-nowrap text-muted-foreground">
                    <th scope="col" className="px-4 py-2 text-left font-medium">
                      Tree
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Members
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Active
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Entries
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Added
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Last active
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.trees.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-border last:border-0"
                    >
                      <th scope="row" className="min-w-40 px-4 py-2 text-left font-normal">
                        <span className="block font-medium">{t.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          Founded {dayWithYear(t.founded)}
                        </span>
                      </th>
                      <td className={cell}>{t.members}</td>
                      <td className={cell}>{t.active7}</td>
                      <td className={cell}>{t.entries}</td>
                      <td className={cell}>{t.added7}</td>
                      <td className={`${cell} whitespace-nowrap`}>
                        {lastActiveLabel(t.lastActive, d.today)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
