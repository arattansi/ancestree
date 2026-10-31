import { getStroke } from "perfect-freehand";

/**
 * Ink on a birthday card (Step 217.4): a drawing, and a name signed by hand,
 * made with a finger or a pencil on a touch screen, in a phone's browser or
 * the app. Kept as strokes, not pictures: each point where it was, how hard
 * it pressed and when, in the box's own 0–1 units, as jsonb on the
 * signature (`card_signatures.ink`). The web and the phone draw it the same
 * way, from here, and the card writes each one out again as it opens.
 *
 * The database checks the same shape (`private.card_ink_ok`, in
 * `20261031090000_card_ink.sql`): change both together.
 */

/** A point: across and down the box (0–1), pressure (0–1), ms since the box's first touch. */
export type InkPoint = [x: number, y: number, pressure: number, t: number];

/** One touch, from down to up. */
export type InkStroke = InkPoint[];

/** A square to draw in, and a strip under the message to sign in. */
export type InkBox = "draw" | "sign";

/** A signature's ink: either box, or both. */
export type CardInk = Partial<Record<InkBox, InkStroke[]>>;

export const INK_BOXES: readonly InkBox[] = ["sign", "draw"];

/** Each box's width over its height. */
export const INK_ASPECT: Readonly<Record<InkBox, number>> = { draw: 1, sign: 4 };

/** About 200 KB as stored, counted as its JSON's characters. */
export const INK_MAX_CHARS = 200_000;

/**
 * What one box may hold, so both together stay under `INK_MAX_CHARS`: a
 * pad stops taking strokes past it.
 */
export const INK_BOX_MAX_CHARS = 99_000;

/** One box's strokes, counted as they're kept. */
export function boxChars(strokes: readonly InkStroke[]): number {
  return JSON.stringify(strokes).length;
}

/** Strokes in a box, and points in a stroke. */
export const INK_MAX_STROKES = 400;
export const INK_MAX_POINTS = 1500;

/** A point's time, at most: ten minutes in one box. */
export const INK_MAX_MS = 600_000;

/** What a finger or a mouse reports: no pressure to speak of. */
export const FLAT_PRESSURE = 0.5;

/**
 * Closer than this to the point before (in box heights), a new point adds
 * nothing to the line and only weighs on the card.
 */
const MIN_STEP = 0.003;

/** The pen, as a share of the box's height: thinner in the square, bolder in the strip. */
const PEN: Readonly<Record<InkBox, number>> = { draw: 0.018, sign: 0.06 };

const round = (v: number, places: number) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * A point as kept, from where a touch is in a box `width` by `height`
 * (pixels or points) and ms since the box's first touch. A pressure of 0
 * (a finger on a phone that can't tell) is kept as flat.
 */
export function inkPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  pressure: number,
  t: number,
): InkPoint {
  const p = Number.isFinite(pressure) && pressure > 0 ? clamp01(pressure) : FLAT_PRESSURE;
  return [
    round(clamp01(width > 0 ? x / width : 0), 4),
    round(clamp01(height > 0 ? y / height : 0), 4),
    round(p, 2),
    Math.min(INK_MAX_MS, Math.max(0, Math.round(t))),
  ];
}

/**
 * Whether `point` is worth adding to `stroke` in `box`: far enough from the
 * one before, and room left in the stroke.
 */
export function worthAdding(stroke: InkStroke, point: InkPoint, box: InkBox): boolean {
  if (stroke.length >= INK_MAX_POINTS) return false;
  const last = stroke[stroke.length - 1];
  if (!last) return true;
  const dx = (point[0] - last[0]) * INK_ASPECT[box];
  const dy = point[1] - last[1];
  return Math.hypot(dx, dy) >= MIN_STEP;
}

/** The ink as kept, counted as the database counts it. */
export function inkChars(ink: CardInk): number {
  return JSON.stringify(ink).length;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function asPoint(value: unknown): InkPoint | null {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(isNumber)) return null;
  const [x, y, p, t] = value as number[];
  if (x < 0 || x > 1 || y < 0 || y > 1 || p < 0 || p > 1 || t < 0 || t > INK_MAX_MS) return null;
  return [x, y, p, t];
}

function asStrokes(value: unknown): InkStroke[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > INK_MAX_STROKES) return null;
  const strokes: InkStroke[] = [];
  for (const s of value) {
    if (!Array.isArray(s) || s.length < 1 || s.length > INK_MAX_POINTS) return null;
    const points: InkStroke = [];
    for (const p of s) {
      const point = asPoint(p);
      if (!point) return null;
      points.push(point);
    }
    strokes.push(points);
  }
  return strokes;
}

/**
 * A signature's ink as the card takes it, or null: nothing drawn, or not
 * ink at all (anything else in it, out of the box, too much of it). The
 * same rules as the database's.
 */
export function asCardInk(raw: unknown): CardInk | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0 || entries.some(([k]) => k !== "draw" && k !== "sign")) return null;
  const ink: CardInk = {};
  for (const [box, value] of entries) {
    const strokes = asStrokes(value);
    if (!strokes) return null;
    ink[box as InkBox] = strokes;
  }
  return inkChars(ink) <= INK_MAX_CHARS ? ink : null;
}

/** Both boxes, as a form holds them; null where nothing's drawn. */
export type InkDraft = Record<InkBox, InkStroke[] | null>;

/** A form's boxes as the card keeps them: null if neither has a line in it. */
export function inkOf(draft: InkDraft): CardInk | null {
  const ink: CardInk = {};
  for (const box of INK_BOXES) {
    const strokes = draft[box];
    if (strokes && strokes.length > 0) ink[box] = strokes;
  }
  return Object.keys(ink).length > 0 ? ink : null;
}

/** A kept signature's ink, as a form starts from it. */
export function draftOf(ink: CardInk | null | undefined): InkDraft {
  return { draw: ink?.draw ?? null, sign: ink?.sign ?? null };
}

/** Whether a stroke says how hard it pressed (a pencil), or is flat (a finger). */
export function pressed(stroke: InkStroke): boolean {
  return stroke.some((p) => Math.abs(p[2] - FLAT_PRESSURE) > 0.01);
}

const fixed = (v: number) => Math.round(v * 100) / 100;

/** perfect-freehand's outline as an SVG path, its corners smoothed with quadratics. */
function outlinePath(outline: number[][]): string {
  if (outline.length === 0) return "";
  const d: (string | number)[] = ["M", fixed(outline[0][0]), fixed(outline[0][1]), "Q"];
  outline.forEach(([x0, y0], i) => {
    const [x1, y1] = outline[(i + 1) % outline.length];
    d.push(fixed(x0), fixed(y0), fixed((x0 + x1) / 2), fixed((y0 + y1) / 2));
  });
  d.push("Z");
  return d.join(" ");
}

/**
 * One stroke as a filled SVG path in a `width` by `height` box: wider where
 * it pressed harder, or, from a finger, where it went slower. `done` false
 * for a stroke still being drawn, so its end isn't tapered yet.
 */
export function strokePath(
  stroke: InkStroke,
  box: InkBox,
  width: number,
  height: number,
  done = true,
): string {
  if (stroke.length === 0) return "";
  const outline = getStroke(
    stroke.map(([x, y, p]) => [x * width, y * height, p]),
    {
      size: Math.max(1.5, PEN[box] * height),
      thinning: 0.6,
      smoothing: 0.5,
      streamline: 0.4,
      simulatePressure: !pressed(stroke),
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
      last: done,
    },
  );
  return outlinePath(outline);
}

/** Every stroke's path, in order. */
export function inkPaths(strokes: readonly InkStroke[], box: InkBox, width: number, height: number): string[] {
  return strokes.map((s) => strokePath(s, box, width, height));
}

/** The longest pause kept between strokes when ink is written out again. */
const REPLAY_GAP = 160;

/** Ink takes this long at most to write out again; longer is sped up to fit. */
export const REPLAY_MAX_MS = 3200;

/**
 * Strokes re-timed to be written out again: as they were drawn, but no
 * pause between two strokes longer than `REPLAY_GAP`, and the whole sped up
 * to fit `REPLAY_MAX_MS`. Starts at 0.
 */
export function replayTimeline(strokes: readonly InkStroke[]): { strokes: InkStroke[]; duration: number } {
  const out: InkStroke[] = [];
  let clock = 0;
  let lastEnd: number | null = null;
  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    const start = stroke[0][3];
    const gap = lastEnd === null ? 0 : Math.min(REPLAY_GAP, Math.max(0, start - lastEnd));
    clock += gap;
    const begin = clock;
    const timed = stroke.map(([x, y, p, t]): InkPoint => [x, y, p, begin + Math.max(0, t - start)]);
    out.push(timed);
    clock = timed[timed.length - 1][3];
    lastEnd = stroke[stroke.length - 1][3];
  }
  const duration = clock;
  if (duration <= REPLAY_MAX_MS || duration === 0) return { strokes: out, duration };
  const k = REPLAY_MAX_MS / duration;
  return {
    strokes: out.map((s) => s.map(([x, y, p, t]): InkPoint => [x, y, p, t * k])),
    duration: REPLAY_MAX_MS,
  };
}

/** What had been written `ms` into a timeline: whole strokes, and the one under way cut short. */
export function inkUpTo(strokes: readonly InkStroke[], ms: number): InkStroke[] {
  const out: InkStroke[] = [];
  for (const stroke of strokes) {
    if (stroke.length === 0 || stroke[0][3] > ms) break;
    const last = stroke[stroke.length - 1];
    if (last[3] <= ms) {
      out.push(stroke);
      continue;
    }
    out.push(stroke.filter((p) => p[3] <= ms));
    break;
  }
  return out;
}

/** XML's own five, escaped. */
const xml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/**
 * One box's ink as an SVG file of its own, near-black on nothing, as the
 * card draws it: for Export data (Step 217.5). `title` names it ("Ada’s
 * drawing").
 */
export function inkSvg(strokes: readonly InkStroke[], box: InkBox, title: string): string {
  const height = 100;
  const width = height * INK_ASPECT[box];
  const paths = inkPaths(strokes, box, width, height)
    .filter((d) => d.length > 0)
    .map((d) => `<path d="${d}"/>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * 4}" height="${height * 4}">` +
    `<title>${xml(title)}</title><g fill="#171717">${paths}</g></svg>\n`
  );
}
