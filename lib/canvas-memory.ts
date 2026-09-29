import type { LivingStatus, TreeFilter } from "@/lib/tree-search";

/**
 * How a tree's canvas was left in this tab (Step 77.3, audit N4): kept as
 * the canvas goes and brought back when it opens again — after Back, Back to
 * tree or a reload — so the reader finds it as they left it.
 */
export type CanvasMemory = {
  /** Who was open, or `null` for nobody. */
  person: string | null;
  /** The flow point at the middle of the canvas, and the zoom. */
  view: { x: number; y: number; zoom: number } | null;
  /** Only the viewer's Root's side (Step 48). */
  sideOnly: boolean;
  /** Only the descendants of these (Step 57.2). */
  descendantsOf: string[];
  /** The search card's filter. */
  filter: TreeFilter;
  /** The two people whose connection was lit. */
  connection: { from: string | null; to: string | null };
  /** The details minimized to a card (Step 49). */
  minimized: boolean;
};

const LIVING: readonly LivingStatus[] = ["any", "living", "deceased"];

const isId = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 64;
const idOrNull = (v: unknown): string | null => (isId(v) ? v : null);
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/**
 * What was kept, from its stored form: `null` for nothing kept, or for
 * anything that doesn't read as a canvas's memory. Each part that's out of
 * shape falls back to how a canvas starts, rather than losing the rest.
 */
export function parseCanvasMemory(raw: string | null): CanvasMemory | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;

  const v = m.view as Record<string, unknown> | null | undefined;
  const view =
    v && finite(v.x) && finite(v.y) && finite(v.zoom) && v.zoom > 0
      ? { x: v.x, y: v.y, zoom: v.zoom }
      : null;

  const f = (m.filter ?? {}) as Record<string, unknown>;
  const text = (x: unknown) => (typeof x === "string" ? x.slice(0, 200) : "");
  const filter: TreeFilter = {
    text: text(f.text),
    country: text(f.country),
    birthDecade:
      typeof f.birthDecade === "string" && /^\d{4}$/.test(f.birthDecade)
        ? f.birthDecade
        : "",
    living: LIVING.includes(f.living as LivingStatus)
      ? (f.living as LivingStatus)
      : "any",
  };

  const c = (m.connection ?? {}) as Record<string, unknown>;
  return {
    person: idOrNull(m.person),
    view,
    sideOnly: m.sideOnly === true,
    descendantsOf: Array.isArray(m.descendantsOf)
      ? m.descendantsOf.filter(isId).slice(0, 2)
      : [],
    filter,
    connection: { from: idOrNull(c.from), to: idOrNull(c.to) },
    minimized: m.minimized === true,
  };
}
