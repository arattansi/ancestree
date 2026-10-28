/**
 * The analytics tab's invites (Step 216): per tree, over the last 30 days,
 * links made → shared → opened → a code sent → joined (and how) → an email
 * added. This reads what `invite_funnel()` answers and words it, so it's
 * tested without a database; `invite-funnel.server.ts` loads it and
 * `components/dashboard/invite-funnel.tsx` draws it.
 */
import { addDays, dayWithYear } from "@/lib/dashboard";
import { JOIN_PATHS, SHARE_CHANNELS } from "@/lib/invite-events";

/** Whose tree: an outside founder's, a beta reviewer's, or a test account's. */
export const FUNNEL_OWNERS = ["outside", "ours", "test"] as const;
export type FunnelOwner = (typeof FUNNEL_OWNERS)[number];

/** A share by a button, or the invite emailed. */
const SHARED_BY = [...SHARE_CHANNELS, "email"] as const;
type SharedBy = (typeof SHARED_BY)[number];

/** A join by its path, or one noted without (before Step 216's code). */
const JOINED_BY = [...JOIN_PATHS, "unknown"] as const;
type JoinedBy = (typeof JOINED_BY)[number];

export type FunnelCounts = {
  made: number;
  /** Links shared at least once. */
  shared: number;
  /** Each press, by which button. */
  sharesBy: Record<SharedBy, number>;
  opened: number;
  codeSent: number;
  joined: number;
  joinedBy: Record<JoinedBy, number>;
  emailAdded: number;
};

export type FunnelTree = FunnelCounts & {
  id: string;
  name: string;
  /** Its Roots' names, earliest first. */
  roots: string[];
  owner: FunnelOwner;
};

export type InviteFunnel = {
  today: string;
  /** The first day anything was counted, or null before anything was. */
  countedFrom: string | null;
  trees: FunnelTree[];
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function count(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function fields(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isoDay(value: unknown): string | null {
  return typeof value === "string" && ISO_DAY.test(value) ? value : null;
}

function counts<K extends string>(keys: readonly K[], raw: unknown): Record<K, number> {
  const f = fields(raw);
  return Object.fromEntries(keys.map((k) => [k, count(f[k])])) as Record<K, number>;
}

/** What `invite_funnel()` answered, or null when it isn't that at all. */
export function readInviteFunnel(raw: unknown): InviteFunnel | null {
  const d = fields(raw);
  const today = isoDay(d.today);
  if (!today) return null;
  const trees = (Array.isArray(d.trees) ? d.trees : []).flatMap((raw): FunnelTree[] => {
    const t = fields(raw);
    if (typeof t.id !== "string" || typeof t.name !== "string") return [];
    const owner = FUNNEL_OWNERS.find((o) => o === t.owner) ?? "outside";
    return [
      {
        id: t.id,
        name: t.name,
        roots: (Array.isArray(t.roots) ? t.roots : []).filter(
          (r): r is string => typeof r === "string",
        ),
        owner,
        made: count(t.made),
        shared: count(t.shared),
        sharesBy: counts(SHARED_BY, t.shares_by),
        opened: count(t.opened),
        codeSent: count(t.code_sent),
        joined: count(t.joined),
        joinedBy: counts(JOINED_BY, t.joined_by),
        emailAdded: count(t.email_added),
      },
    ];
  });
  return { today, countedFrom: isoDay(d.counted_from), trees };
}

function emptyCounts(): FunnelCounts {
  return {
    made: 0,
    shared: 0,
    sharesBy: counts(SHARED_BY, {}),
    opened: 0,
    codeSent: 0,
    joined: 0,
    joinedBy: counts(JOINED_BY, {}),
    emailAdded: 0,
  };
}

/** Every tree's counts added up. */
export function totalOf(trees: readonly FunnelCounts[]): FunnelCounts {
  const total = emptyCounts();
  for (const t of trees) {
    total.made += t.made;
    total.shared += t.shared;
    total.opened += t.opened;
    total.codeSent += t.codeSent;
    total.joined += t.joined;
    total.emailAdded += t.emailAdded;
    for (const k of SHARED_BY) total.sharesBy[k] += t.sharesBy[k];
    for (const k of JOINED_BY) total.joinedBy[k] += t.joinedBy[k];
  }
  return total;
}

const GROUP_TITLES: Record<FunnelOwner, string> = {
  outside: "Outside founders",
  ours: "Beta reviewers",
  test: "Test accounts",
};

export type FunnelGroup = {
  owner: FunnelOwner;
  title: string;
  trees: FunnelTree[];
  total: FunnelCounts;
};

/** The trees by whose they are, outside founders first; empty groups left out. */
export function funnelGroups(funnel: InviteFunnel): FunnelGroup[] {
  return FUNNEL_OWNERS.flatMap((owner) => {
    const trees = funnel.trees.filter((t) => t.owner === owner);
    return trees.length
      ? [{ owner, title: GROUP_TITLES[owner], trees, total: totalOf(trees) }]
      : [];
  });
}

const SHARED_LABELS: Record<SharedBy, string> = {
  share: "share sheet",
  whatsapp: "WhatsApp",
  messages: "Messages",
  copy: "copy",
  email: "email",
};

const JOINED_LABELS: Record<JoinedBy, string> = {
  name: "name",
  email_code: "email code",
  emailed_invite: "emailed invite",
  signed_in: "signed in",
  unknown: "other",
};

function breakdown<K extends string>(
  by: Record<K, number>,
  keys: readonly K[],
  labels: Record<K, string>,
): string[] {
  return keys.filter((k) => by[k] > 0).map((k) => `${labels[k]} ${by[k]}`);
}

/** ["WhatsApp 2", "copy 1"]: each press of a share button, and each email. */
export function sharesBreakdown(c: FunnelCounts): string[] {
  return breakdown(c.sharesBy, SHARED_BY, SHARED_LABELS);
}

/** ["name 1", "email code 1"]: how they came in. */
export function joinsBreakdown(c: FunnelCounts): string[] {
  return breakdown(c.joinedBy, JOINED_BY, JOINED_LABELS);
}

/**
 * "Counted since 28 Oct 2026", while the record is younger than the 30 days
 * shown; null once it covers them all, or before anything was counted.
 */
export function countedSince(funnel: InviteFunnel): string | null {
  if (!funnel.countedFrom || funnel.countedFrom <= addDays(funnel.today, -30)) return null;
  return `Counted since ${dayWithYear(funnel.countedFrom)}`;
}
