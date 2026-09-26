import {
  axisLabelOnPhone,
  countAxis,
  weekRange,
  weekStart,
  type DashboardWeek,
} from "@/lib/dashboard";
import { cn } from "@/lib/utils";

function membersActive(n: number): string {
  return `${n} ${n === 1 ? "member" : "members"} active`;
}

/**
 * Members active each week, a column a week (Step 56). One series, so no
 * legend: the card's title names it. The newest column carries its count;
 * hovering or focusing any column shows its week, and the card's table
 * under it has every number. No script: the tooltips are CSS.
 */
export function WeeklyActiveChart({ weeks }: { weeks: DashboardWeek[] }) {
  const { top, ticks } = countAxis(weeks.map((w) => w.active));
  const newest = weeks.length - 1;

  return (
    <figure aria-label="Members active each week" className="flex flex-col gap-2">
      {/* Room above the plot for the newest column's count, and to its left
          for the axis. */}
      <div className="h-44 pt-5 pl-7">
        <div className="relative h-full">
          {ticks.map((tick) => (
            <div
              key={tick}
              aria-hidden
              className="absolute inset-x-0 border-t border-border"
              style={{ bottom: `${(tick / top) * 100}%` }}
            >
              <span className="absolute right-full mr-2 -translate-y-1/2 text-xs tabular-nums text-muted-foreground">
                {tick}
              </span>
            </div>
          ))}
          <ol className="absolute inset-0 flex items-end">
            {weeks.map((w, i) => {
              const height = (w.active / top) * 100;
              return (
                <li
                  key={w.end}
                  tabIndex={0}
                  className="group relative flex h-full min-w-0 flex-1 items-end justify-center rounded-sm outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <span className="sr-only">
                    {`${weekRange(w.end)}: ${membersActive(w.active)}`}
                  </span>
                  {w.active > 0 ? (
                    <span
                      aria-hidden
                      className="block w-3/5 max-w-6 rounded-t-[4px] bg-chart-1"
                      style={{ height: `${height}%` }}
                    />
                  ) : null}
                  {i === newest ? (
                    <span
                      aria-hidden
                      className="absolute text-xs font-medium"
                      style={{ bottom: `calc(${height}% + 4px)` }}
                    >
                      {w.active}
                    </span>
                  ) : null}
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute top-0 z-10 hidden w-max rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm group-hover:block group-focus-visible:block",
                      i < weeks.length / 2 ? "left-0" : "right-0",
                    )}
                  >
                    <span className="block font-medium">
                      {membersActive(w.active)}
                    </span>
                    <span className="block text-muted-foreground">
                      {weekRange(w.end)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      {/* Each label is centred on its column, however narrow; one a phone
          skips keeps its place, so the rest stay under their columns. */}
      <ol aria-hidden className="flex pl-7 text-xs text-muted-foreground">
        {weeks.map((w, i) => (
          <li key={w.end} className="relative h-4 min-w-0 flex-1">
            <span
              className={cn(
                "absolute left-1/2 -translate-x-1/2 whitespace-nowrap",
                !axisLabelOnPhone(i, weeks.length) && "invisible sm:visible",
              )}
            >
              {weekStart(w.end)}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
