/**
 * Birthday candles (Step 205): three on the icing of a card turned cake, and
 * three stuck into the top of a leaf, on the web's canvas and the phone's
 * leaf view alike. Measured in card pixels, which are blade-box units too
 * (`lib/leaf-shapes.ts`): a leaf's box is its card less 19 top and bottom.
 *
 * They stand right of the middle, where a parent's line comes down onto a
 * card or a leaf, so no line ever runs into a flame.
 */

import {
  inside,
  leafGeometry,
  MIDRIB,
  polygons,
  type LeafShape,
} from "@/lib/leaf-shapes";

type XY = { x: number; y: number };

/** One candle: a stick, the wick showing above it, and the flame. */
export const CANDLE = {
  width: 5,
  stick: 15,
  wick: 2,
  flameWidth: 7,
  flameHeight: 10,
} as const;

/** From a candle's foot to the tip of its flame. */
export const CANDLE_HEIGHT = CANDLE.stick + CANDLE.wick + CANDLE.flameHeight;

/**
 * Where across a card or a leaf the three candles stand: clear of the
 * columns a descent line lands in (98–110, `leafGeometry`), flame and all.
 */
export const CANDLE_XS = [126, 142, 158] as const;

/** How far a candle's foot is pressed in below the edge it stands on. */
export const SINK = 2;

/**
 * The highest a candle's foot stands on a leaf. A lobe reaching higher (a
 * maple's, a plane's) takes the candle in deeper, so a flame never stands
 * more than this much above the box: on the phone, the parents' row sits
 * close over the leaf.
 */
const HIGHEST_FOOT = 4;

const feet = new Map<LeafShape, XY[]>();

/**
 * Where each candle's foot stands on a leaf, in blade-box units: the
 * highest spot where the stick's whole foot is pressed into the blade, by
 * `SINK`, so none stands on air where the edge slopes away or between a
 * frond's leaflets or a sprig's needles.
 */
export function leafCandles(shape: LeafShape): XY[] {
  const known = feet.get(shape);
  if (known) return known;
  const polys = polygons(leafGeometry(shape).blade);
  const half = CANDLE.width / 2;
  const pressedIn = (x: number, y: number) => {
    for (let cx = x - half; cx <= x + half; cx += 0.5) {
      for (let cy = y - SINK; cy <= y; cy += 0.5) {
        if (!inside(polys, { x: cx, y: cy })) return false;
      }
    }
    return true;
  };
  const found = CANDLE_XS.map((x) => {
    let y = HIGHEST_FOOT;
    // Every blade keeps a solid body along its midrib, so this ends there
    // at the latest.
    while (y < MIDRIB && !pressedIn(x, y)) y += 0.5;
    return { x, y };
  });
  feet.set(shape, found);
  return found;
}

/**
 * A birthday card going round for someone (Step 217.4): the small envelope
 * at their leaf's shoulder on the phone, as the web puts one at the corner
 * of their card. The web's mark, 30 by 21, tilted.
 */
export const ENVELOPE = { width: 30, height: 21, tilt: 8 } as const;

/** Where across a leaf the envelope's middle is: right of the candles, short of the tip. */
const ENVELOPE_X = 184;

/** How far its foot tucks into the blade, where the blade reaches up that high. */
const TUCK = 7;

/** How far above the box a lobe can reach: `BLADE_OVERHANG`'s worth, and a little. */
const BLADE_REACH = 14;

/** The lowest its foot sits: where the blade is low there, it floats above the name. */
const LOWEST_FOOT = 30;

const envelopes = new Map<LeafShape, XY>();

/**
 * Where the envelope sits on a leaf, its top-left corner in blade-box
 * units: its foot tucked into the top edge of the blade right of the
 * candles, so it's clear of them on a birthday, or, on a blade that's low
 * there, at the shoulder, above where the name is written.
 */
export function leafEnvelope(shape: LeafShape): XY {
  const known = envelopes.get(shape);
  if (known) return known;
  const polys = polygons(leafGeometry(shape).blade);
  const half = ENVELOPE.width / 2;
  let edge: number = MIDRIB;
  for (let x = ENVELOPE_X - half; x <= ENVELOPE_X + half; x += 1) {
    for (let y = -BLADE_REACH; y < edge; y += 0.5) {
      if (inside(polys, { x, y })) {
        edge = y;
        break;
      }
    }
  }
  const foot = Math.min(edge + TUCK, LOWEST_FOOT);
  const found = { x: ENVELOPE_X - half, y: foot - ENVELOPE.height };
  envelopes.set(shape, found);
  return found;
}
