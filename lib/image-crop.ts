import type * as React from "react";

/**
 * Geometry for the square thumbnail crop. Photos are shown as circles/squares
 * with `object-cover` everywhere in the app, so the crop is baked into the
 * uploaded file — what the picker previews is exactly what the tree renders.
 *
 * The crop is described by a zoom (1 = the largest square that fits) and a
 * focus point in [0, 1]², the CSS `object-position` convention: 0 pins the
 * crop to the left/top edge of the source, 1 to the right/bottom.
 */

export type CropTransform = { zoom: number; focusX: number; focusY: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export const DEFAULT_CROP: CropTransform = {
  zoom: MIN_ZOOM,
  focusX: 0.5,
  focusY: 0.5,
};

/** How a crop is stored on `people.photo_crop` (snake_case, like the column). */
export type StoredCrop = { zoom: number; focus_x: number; focus_y: number };

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** The source-pixel square to draw, given the image size and transform. */
export function cropRect(
  width: number,
  height: number,
  { zoom, focusX, focusY }: CropTransform,
): { sx: number; sy: number; size: number } {
  const safeZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const size = Math.min(width, height) / safeZoom;
  return {
    sx: (width - size) * clamp(focusX, 0, 1),
    sy: (height - size) * clamp(focusY, 0, 1),
    size,
  };
}

/**
 * Move one focus axis by a drag of `deltaPx` inside a preview `frame` px wide.
 * `span` is the source extent on that axis; dragging right reveals what is to
 * the left, so the focus moves against the pointer.
 */
export function panFocus(
  focus: number,
  deltaPx: number,
  frame: number,
  span: number,
  cropSize: number,
): number {
  const slack = span - cropSize;
  if (slack <= 0 || frame <= 0) return clamp(focus, 0, 1);
  const scale = frame / cropSize; // source px -> preview px
  return clamp(focus - deltaPx / scale / slack, 0, 1);
}

/**
 * Where the source image sits inside the preview frame, as CSS-ready values.
 * Mirrors `cropRect` so the preview and the encoded file can never disagree.
 */
export function previewLayout(
  width: number,
  height: number,
  frame: number,
  transform: CropTransform,
): { width: number; height: number; left: number; top: number } {
  const { sx, sy, size } = cropRect(width, height, transform);
  const scale = frame / size;
  return {
    width: width * scale,
    height: height * scale,
    left: -sx * scale,
    top: -sy * scale,
  };
}

/** Read a crop off a `people` row, falling back to the centred default. */
export function parseCrop(value: unknown): CropTransform {
  if (!value || typeof value !== "object") return DEFAULT_CROP;
  const raw = value as Record<string, unknown>;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    zoom: clamp(num(raw.zoom, MIN_ZOOM), MIN_ZOOM, MAX_ZOOM),
    focusX: clamp(num(raw.focus_x, 0.5), 0, 1),
    focusY: clamp(num(raw.focus_y, 0.5), 0, 1),
  };
}

/** The shape written back to the column. */
export function toStoredCrop({
  zoom,
  focusX,
  focusY,
}: CropTransform): StoredCrop {
  return {
    zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM),
    focus_x: clamp(focusX, 0, 1),
    focus_y: clamp(focusY, 0, 1),
  };
}

/**
 * CSS that frames an `<img>` filling a square box exactly as `cropRect` would.
 * `object-position` reproduces the crop at zoom 1; scaling about that same
 * point keeps it fixed, which is precisely how `cropRect` moves under zoom.
 */
export function cropStyle({
  zoom,
  focusX,
  focusY,
}: CropTransform): React.CSSProperties {
  const origin = `${clamp(focusX, 0, 1) * 100}% ${clamp(focusY, 0, 1) * 100}%`;
  const safeZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  return {
    objectFit: "cover",
    objectPosition: origin,
    ...(safeZoom > 1
      ? { transform: `scale(${safeZoom})`, transformOrigin: origin }
      : null),
  };
}
