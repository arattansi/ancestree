/**
 * The engagement dashboard (Step 56): the beta reviewers' tab on the account
 * page, counting across the whole site and never naming a person. This
 * reads what `engagement_dashboard()` answers and words it, so it's tested
 * without a database; `dashboard.server.ts` loads it and
 * `components/dashboard/` draws it.
 */

/** Fixed rather than the browser's locale, like `lib/partial-date.ts`. */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The first day a member's days were noted as they came (Step 56). Before
 * it, a day counts only if they signed in or added something that day.
 */
export const NOTED_FROM = "2026-09-26";

/** Seven days, up to and including `end`: the newest is the last seven days. */
export type DashboardWeek = {
  /** `YYYY-MM-DD`, UTC, as the database counts days. */
  end: string;
  /** Members who used ancestree on any of the seven days. */
  active: number;
  /** Members who joined in them. */
  joined: number;
  /** Entries added in them. */
  entries: number;
};

export const ACTIVITY_KINDS = [
  "entries",
  "connections",
  "photos",
  "documents",
  "comments",
  "companions",
  "claims",
  "invites",
  "joins",
  "access_requests",
  "relayed_asks",
  "tree_requests",
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** How often something was done: in the last seven days, the seven before, and ever. */
export type ActivityCounts = { last7: number; prev7: number; total: number };

/** How many members have done each thing at least once. */
export type MemberProgress = {
  ownEntry: number;
  addedRelative: number;
  invited: number;
  cameBack: number;
};

export type DashboardTree = {
  id: string;
  name: string;
  founded: string;
  members: number;
  /** Its members who used ancestree in the last seven days, on any tree. */
  active7: number;
  /** Entries it shows, from other trees too. */
  entries: number;
  /** Of those, shown on it in the last seven days. */
  added7: number;
  /** The last day any of its members used ancestree. */
  lastActive: string | null;
};

export type Dashboard = {
  today: string;
  members: number;
  /** Joined in the last seven days. */
  membersNew: number;
  active7: number;
  /** Active in the seven days before the last seven. */
  activePrev7: number;
  active30: number;
  entries: number;
  entriesNew: number;
  /** Twelve weeks, oldest first. */
  weeks: DashboardWeek[];
  progress: MemberProgress;
  activity: Record<ActivityKind, ActivityCounts>;
  trees: DashboardTree[];
};

/** A count the database sent, or 0 for anything that isn't one. */
function count(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : 0;
}

function isoDay(value: unknown): string | null {
  return typeof value === "string" && ISO_DAY.test(value) ? value : null;
}

function fields(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * What `engagement_dashboard()` answered, in the tab's shapes, or null when
 * it isn't the dashboard at all. A kind of activity nothing has happened to
 * isn't sent; it reads as zeros.
 */
export function readDashboard(raw: unknown): Dashboard | null {
  const d = fields(raw);
  const today = isoDay(d.today);
  if (!today) return null;

  const progress = fields(d.progress);
  const activity = fields(d.activity);
  return {
    today,
    members: count(d.members),
    membersNew: count(d.members_new),
    active7: count(d.active_7),
    activePrev7: count(d.active_prev_7),
    active30: count(d.active_30),
    entries: count(d.entries),
    entriesNew: count(d.entries_new),
    weeks: list(d.weeks)
      .flatMap((raw) => {
        const w = fields(raw);
        const end = isoDay(w.end);
        return end
          ? [
              {
                end,
                active: count(w.active),
                joined: count(w.joined),
                entries: count(w.entries),
              },
            ]
          : [];
      })
      .sort((a, b) => a.end.localeCompare(b.end)),
    progress: {
      ownEntry: count(progress.own_entry),
      addedRelative: count(progress.added_relative),
      invited: count(progress.invited),
      cameBack: count(progress.came_back),
    },
    activity: Object.fromEntries(
      ACTIVITY_KINDS.map((kind) => {
        const c = fields(activity[kind]);
        return [
          kind,
          { last7: count(c.last_7), prev7: count(c.prev_7), total: count(c.total) },
        ];
      }),
    ) as Record<ActivityKind, ActivityCounts>,
    trees: list(d.trees).flatMap((raw) => {
      const t = fields(raw);
      const founded = isoDay(t.founded);
      if (typeof t.id !== "string" || typeof t.name !== "string" || !founded) {
        return [];
      }
      return [
        {
          id: t.id,
          name: t.name,
          founded,
          members: count(t.members),
          active7: count(t.active_7),
          entries: count(t.entries),
          added7: count(t.added_7),
          lastActive: isoDay(t.last_active),
        },
      ];
    }),
  };
}

/**
 * The weeks worth drawing: from the first in which anything happened, so a
 * young site isn't a row of empty weeks. The newest always stays.
 */
export function weeksSinceFirstActivity(
  weeks: readonly DashboardWeek[],
): DashboardWeek[] {
  const first = weeks.findIndex(
    (w) => w.active > 0 || w.joined > 0 || w.entries > 0,
  );
  return first === -1 ? weeks.slice(-1) : weeks.slice(first);
}

/**
 * A count axis for bars as tall as `values`: gridlines a round step apart
 * (1, 2, 2.5 or 5, times a power of ten, and a whole count), about three
 * of them above nought, and the top at the first one that clears the
 * tallest bar.
 */
export function countAxis(values: readonly number[]): {
  top: number;
  ticks: number[];
} {
  const tallest = Math.max(1, ...values);
  const rough = tallest / 3;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10]
      .map((m) => m * magnitude)
      .find((s) => s >= rough && Number.isInteger(s)) ?? 1;
  const top = Math.ceil(tallest / step) * step;
  return {
    top,
    ticks: Array.from({ length: top / step + 1 }, (_, i) => i * step),
  };
}

function dayParts(iso: string): { year: number; month: number; date: number } {
  const [, year, month, date] = ISO_DAY.exec(iso) ?? [];
  return { year: Number(year), month: Number(month), date: Number(date) };
}

/** The day `days` after (or before) `iso`. */
export function addDays(iso: string, days: number): string {
  const { year, month, date } = dayParts(iso);
  return new Date(Date.UTC(year, month - 1, date + days))
    .toISOString()
    .slice(0, 10);
}

/**
 * Whether a phone shows column `index`'s day under the chart: all of them
 * up to six columns, then every other one back from the newest, so the
 * labels never crowd. Wider screens show every one.
 */
export function axisLabelOnPhone(index: number, columns: number): boolean {
  return columns <= 6 || (columns - 1 - index) % 2 === 0;
}

/** "26 Sep". */
export function shortDay(iso: string): string {
  const { month, date } = dayParts(iso);
  return `${date} ${MONTHS[month - 1]}`;
}

/** "30 Aug 2026", for a day that may be in another year. */
export function dayWithYear(iso: string): string {
  return `${shortDay(iso)} ${dayParts(iso).year}`;
}

/** A week's first day, "20 Sep": what the chart's axis says under it. */
export function weekStart(end: string): string {
  return shortDay(addDays(end, -6));
}

/** A week by its days: "20–26 Sep", or "30 Aug – 5 Sep" across two months. */
export function weekRange(end: string): string {
  const start = dayParts(addDays(end, -6));
  const last = dayParts(end);
  return start.month === last.month
    ? `${start.date}–${last.date} ${MONTHS[last.month - 1]}`
    : `${start.date} ${MONTHS[start.month - 1]} – ${last.date} ${MONTHS[last.month - 1]}`;
}

/** When a tree's members were last on: "Today", "Yesterday", "21 Sep", or "Not yet". */
export function lastActiveLabel(lastActive: string | null, today: string): string {
  if (!lastActive) return "Not yet";
  if (lastActive === today) return "Today";
  if (lastActive === addDays(today, -1)) return "Yesterday";
  return shortDay(lastActive);
}

/** This week's count against the week before's. */
export function againstWeekBefore(now: number, before: number): string {
  if (now === before) return "Same as the week before";
  return now > before
    ? `Up ${now - before} on the week before`
    : `Down ${before - now} on the week before`;
}

/** How much of a bar `part` of `whole` fills, 0 to 100. */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((Math.min(part, whole) / whole) * 100);
}

export type HeadlineTile = { label: string; value: number; note: string };

function newInLastWeek(n: number): string {
  return n === 0 ? "None new in the last 7 days" : `${n} new in the last 7 days`;
}

/** The numbers the tab leads with. */
export function headlineTiles(d: Dashboard): HeadlineTile[] {
  return [
    { label: "Members", value: d.members, note: newInLastWeek(d.membersNew) },
    {
      label: "Active in the last 7 days",
      value: d.active7,
      note: againstWeekBefore(d.active7, d.activePrev7),
    },
    {
      label: "Active in the last 30 days",
      value: d.active30,
      note: `Of ${d.members} ${d.members === 1 ? "member" : "members"}`,
    },
    { label: "Entries", value: d.entries, note: newInLastWeek(d.entriesNew) },
  ];
}

/** "How Far Members Have Got", in the order a member usually gets there. */
export const PROGRESS_ROWS: { key: keyof MemberProgress; label: string }[] = [
  { key: "ownEntry", label: "Have their own entry" },
  { key: "addedRelative", label: "Added a relative" },
  { key: "invited", label: "Invited someone" },
  { key: "cameBack", label: "Came back another day" },
];

/** "What Members Did", row by row. */
export const ACTIVITY_GROUPS: {
  title: string;
  rows: { kind: ActivityKind; label: string }[];
}[] = [
  {
    title: "On the trees",
    rows: [
      { kind: "entries", label: "Entries added" },
      { kind: "connections", label: "Connections drawn" },
      { kind: "photos", label: "Photos uploaded" },
      { kind: "documents", label: "Documents uploaded" },
      { kind: "comments", label: "Comments and flags" },
      { kind: "companions", label: "Companions added" },
      { kind: "claims", label: "Entries claimed" },
    ],
  },
  {
    title: "Invites and joining",
    rows: [
      { kind: "invites", label: "Invites sent" },
      { kind: "joins", label: "Joined a tree" },
      { kind: "access_requests", label: "Requests for access" },
      { kind: "relayed_asks", label: "Asks passed to a relative" },
      { kind: "tree_requests", label: "Requests to start a tree" },
    ],
  },
];
