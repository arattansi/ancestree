/**
 * Who else has the tree open, and where their pointer is (Step 57.3): the
 * parts that don't need a browser or a socket. The channel itself lives in
 * `components/tree/use-tree-room.ts`.
 */

/** The private Realtime channel for a tree; the policies on
 *  `realtime.messages` (migration `tree_presence`) read the id back out. */
export function treeTopic(treeId: string): string {
  return `tree:${treeId}`;
}

/**
 * How often a pointer is sent, in ms, when `others` people are looking.
 * Each message reaches every other member, so the traffic grows with the
 * square of the room; the free plan relays 100 messages a second in all.
 * Two people get ~12 a second, which reads as smooth; a crowd gets less.
 */
export function cursorInterval(others: number): number {
  const n = others + 1;
  return Math.min(1000, Math.max(80, Math.round(n * n * 16.7)));
}

/**
 * Pointer colours: the 700 shades, dark enough for white initials and name
 * tags on either theme.
 */
export const PRESENCE_COLOURS = [
  // In an order where neighbours differ, since two people whose ids land on
  // the same colour take the next one along.
  "#b91c1c", // red
  "#1d4ed8", // blue
  "#15803d", // green
  "#a21caf", // fuchsia
  "#c2410c", // orange
  "#0f766e", // teal
  "#6d28d9", // violet
  "#a16207", // yellow
  "#0369a1", // sky
  "#be123c", // rose
] as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * A colour each, the same on every screen: each person's colour comes from
 * their id, and when two land on the same one, whoever's id sorts later
 * moves to the next free colour. Everyone sees the same room, so everyone
 * works it out the same way. Past ten people, colours repeat.
 */
export function presenceColours(
  userIds: readonly string[],
): Map<string, string> {
  const colours = new Map<string, string>();
  const taken = new Set<number>();
  const n = PRESENCE_COLOURS.length;
  for (const id of [...new Set(userIds)].sort()) {
    let i = hash(id) % n;
    if (taken.size < n) while (taken.has(i)) i = (i + 1) % n;
    taken.add(i);
    colours.set(id, PRESENCE_COLOURS[i]);
  }
  return colours;
}

/** Where a pointer is, as sent: beside a card rather than on the canvas,
 *  since members can have the tree laid out differently (a filter on, a
 *  card pulled out), and the pointer should land by the same person. */
export type CursorPoint = {
  /** The card it's nearest, by id. */
  a: string;
  /** From that card's top-left corner, in canvas units. */
  x: number;
  y: number;
};

type Box = { id: string; x: number; y: number; width: number; height: number };

/** The pointer at `point` (canvas units) as an offset from the nearest
 *  card; null when there are no cards. */
export function anchorPoint(
  point: { x: number; y: number },
  cards: Iterable<Box>,
): CursorPoint | null {
  let best: Box | null = null;
  let bestD = Infinity;
  for (const c of cards) {
    // Distance to the card's edge, zero inside it.
    const dx = Math.max(c.x - point.x, 0, point.x - (c.x + c.width));
    const dy = Math.max(c.y - point.y, 0, point.y - (c.y + c.height));
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (!best) return null;
  return {
    a: best.id,
    x: Math.round(point.x - best.x),
    y: Math.round(point.y - best.y),
  };
}

/** A received pointer on this canvas, or null when its card isn't drawn
 *  here (filtered out, say): better no pointer than one in the wrong place. */
export function placePoint(
  point: CursorPoint,
  cardAt: (id: string) => { x: number; y: number } | null | undefined,
): { x: number; y: number } | null {
  const card = cardAt(point.a);
  return card ? { x: card.x + point.x, y: card.y + point.y } : null;
}

/** A cursor message off the wire, checked: anything else is dropped. */
export function parseCursor(
  payload: unknown,
): { u: string; point: CursorPoint | null } | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.u !== "string" || !p.u) return null;
  if (p.a === null) return { u: p.u, point: null };
  if (
    typeof p.a !== "string" ||
    typeof p.x !== "number" ||
    typeof p.y !== "number" ||
    !Number.isFinite(p.x) ||
    !Number.isFinite(p.y)
  )
    return null;
  return { u: p.u, point: { a: p.a, x: p.x, y: p.y } };
}

/** What each open page says about itself in the room. */
export type PresenceMeta = {
  /** Their own entry on the tree, for the face. */
  person: string | null;
  name: string;
  /** The tab is in the background. */
  away: boolean;
};

export type Peer = {
  userId: string;
  person: string | null;
  name: string;
  /** Away only when every tab they have open is. */
  away: boolean;
};

/**
 * The people in the room from Realtime's presence state (keyed by user id,
 * a meta per open tab), without the viewer, in a steady order: here before
 * away, then by name.
 */
export function peersFrom(
  state: Record<string, readonly Partial<PresenceMeta>[]>,
  selfUserId: string,
): Peer[] {
  const peers: Peer[] = [];
  for (const [userId, metas] of Object.entries(state)) {
    if (userId === selfUserId || metas.length === 0) continue;
    const first = metas[0];
    peers.push({
      userId,
      person: typeof first.person === "string" ? first.person : null,
      name: typeof first.name === "string" ? first.name : "",
      away: metas.every((m) => m.away === true),
    });
  }
  return peers.sort(
    (a, b) =>
      Number(a.away) - Number(b.away) ||
      a.name.localeCompare(b.name) ||
      a.userId.localeCompare(b.userId),
  );
}
