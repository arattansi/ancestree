/**
 * The analytics tab's birthday cards (Step 217.3): each card made or with
 * anything in the last 30 days, its links made (public, personal) → shared
 * → opened → signed (in the app, through the link, through a personal link)
 * → join buttons shown → asks → claims. This reads what `card_funnel()`
 * answers and words it, so it's tested without a database;
 * `card-funnel.server.ts` loads it and `components/dashboard/card-funnel.tsx`
 * draws it.
 */
import { addDays, dayWithYear } from "@/lib/dashboard";
import { FUNNEL_OWNERS, type FunnelOwner } from "@/lib/invite-funnel";
import { SHARE_CHANNELS } from "@/lib/invite-events";

/** How a signature came, as `card_events` keeps it. */
export const SIGNED_BY = ["app", "link", "personal_link"] as const;
type SignedBy = (typeof SIGNED_BY)[number];
type SharedBy = (typeof SHARE_CHANNELS)[number];

export type CardFunnelRow = {
  id: string;
  /** The birthday, `YYYY-MM-DD`. */
  opensOn: string;
  firstName: string;
  treeName: string;
  owner: FunnelOwner;
  /** Signatures on it now. */
  signatures: number;
  links: number;
  personalLinks: number;
  shared: number;
  sharesBy: Record<SharedBy, number>;
  opened: number;
  signed: number;
  signedBy: Record<SignedBy, number>;
  joinShown: number;
  asked: number;
  claimed: number;
};

export type CardFunnel = {
  today: string;
  countedFrom: string | null;
  cards: CardFunnelRow[];
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

/** What `card_funnel()` answered, or null when it isn't that at all. */
export function readCardFunnel(raw: unknown): CardFunnel | null {
  const d = fields(raw);
  const today = isoDay(d.today);
  if (!today) return null;
  const cards = (Array.isArray(d.cards) ? d.cards : []).flatMap((raw): CardFunnelRow[] => {
    const c = fields(raw);
    const opensOn = isoDay(c.opens_on);
    if (typeof c.id !== "string" || !opensOn) return [];
    return [
      {
        id: c.id,
        opensOn,
        firstName: typeof c.first_name === "string" ? c.first_name : "",
        treeName: typeof c.tree_name === "string" ? c.tree_name : "",
        owner: FUNNEL_OWNERS.find((o) => o === c.owner) ?? "outside",
        signatures: count(c.signatures),
        links: count(c.links),
        personalLinks: count(c.personal_links),
        shared: count(c.shared),
        sharesBy: counts(SHARE_CHANNELS, c.shares_by),
        opened: count(c.opened),
        signed: count(c.signed),
        signedBy: counts(SIGNED_BY, c.signed_by),
        joinShown: count(c.join_shown),
        asked: count(c.asked),
        claimed: count(c.claimed),
      },
    ];
  });
  return { today, countedFrom: isoDay(d.counted_from), cards };
}

const GROUP_TITLES: Record<FunnelOwner, string> = {
  outside: "Outside founders",
  ours: "Beta reviewers",
  test: "Test accounts",
};

/** The cards by whose tree they're on, outside founders first; empty groups left out. */
export function cardFunnelGroups(
  funnel: CardFunnel,
): { owner: FunnelOwner; title: string; cards: CardFunnelRow[] }[] {
  return FUNNEL_OWNERS.flatMap((owner) => {
    const cards = funnel.cards.filter((c) => c.owner === owner);
    return cards.length ? [{ owner, title: GROUP_TITLES[owner], cards }] : [];
  });
}

const SHARED_LABELS: Record<SharedBy, string> = {
  share: "share sheet",
  whatsapp: "WhatsApp",
  messages: "Messages",
  copy: "copy",
};

const SIGNED_LABELS: Record<SignedBy, string> = {
  app: "app",
  link: "link",
  personal_link: "personal link",
};

/** ["WhatsApp 2", "copy 1"]. */
export function cardSharesBreakdown(c: CardFunnelRow): string[] {
  return SHARE_CHANNELS.filter((k) => c.sharesBy[k] > 0).map((k) => `${SHARED_LABELS[k]} ${c.sharesBy[k]}`);
}

/** ["app 3", "link 2"]. */
export function signedBreakdown(c: CardFunnelRow): string[] {
  return SIGNED_BY.filter((k) => c.signedBy[k] > 0).map((k) => `${SIGNED_LABELS[k]} ${c.signedBy[k]}`);
}

/** "Counted since 30 Oct 2026", while the record is younger than the 30 days shown. */
export function cardsCountedSince(funnel: CardFunnel): string | null {
  if (!funnel.countedFrom || funnel.countedFrom <= addDays(funnel.today, -30)) return null;
  return `Counted since ${dayWithYear(funnel.countedFrom)}`;
}
