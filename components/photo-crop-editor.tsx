"use client";

import * as React from "react";

import {
  clamp,
  MAX_ZOOM,
  MIN_ZOOM,
  panFocus,
  previewLayout,
  type CropTransform,
} from "@/lib/image-crop";

const FRAME = 224;

/**
 * The round framing control: drag or arrow-key to pan, slider to zoom. Purely
 * controlled — the caller owns the crop and decides when to save it.
 */
export function PhotoCropEditor({
  url,
  crop,
  onCropChange,
  onUnreadable,
}: {
  url: string;
  crop: CropTransform;
  onCropChange: (crop: CropTransform) => void;
  onUnreadable?: () => void;
}) {
  // Keyed by URL so a switch to another photo doesn't briefly reuse the old
  // dimensions, without resetting state from inside the effect.
  const [measured, setMeasured] = React.useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const size = measured?.url === url ? measured : null;
  const dragRef = React.useRef<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    let live = true;
    const img = new window.Image();
    img.onload = () => {
      if (live) {
        setMeasured({
          url,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      }
    };
    img.onerror = () => {
      if (live) onUnreadable?.();
    };
    img.src = url;
    return () => {
      live = false;
    };
    // `onUnreadable` is a callback prop; re-measuring is keyed on the URL alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  function pan(dx: number, dy: number) {
    if (!size) return;
    const crop_ = Math.min(size.width, size.height) / crop.zoom;
    onCropChange({
      ...crop,
      focusX: panFocus(crop.focusX, dx, FRAME, size.width, crop_),
      focusY: panFocus(crop.focusY, dy, FRAME, size.height, crop_),
    });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = dragRef.current;
    if (!start) return;
    pan(e.clientX - start.x, e.clientY - start.y);
    dragRef.current = { x: e.clientX, y: e.clientY };
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 24 : 8;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    pan(move[0], move[1]);
  }

  const layout = size
    ? previewLayout(size.width, size.height, FRAME, crop)
    : null;

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm text-muted-foreground">
        Drag to position, zoom to fit. The circle is what everyone sees.
      </p>
      <div
        role="application"
        aria-label="Position the photo inside the thumbnail. Drag, or use the arrow keys."
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        style={{ width: FRAME, height: FRAME }}
        className="relative cursor-grab touch-none overflow-hidden rounded-full border border-border bg-muted select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
      >
        {layout ? (
          <img
            src={url}
            alt=""
            draggable={false}
            style={{
              width: layout.width,
              height: layout.height,
              left: layout.left,
              top: layout.top,
            }}
            className="pointer-events-none absolute max-w-none"
          />
        ) : null}
      </div>

      <label className="flex w-full max-w-xs items-center gap-2 text-xs text-muted-foreground">
        Zoom
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={crop.zoom}
          onChange={(e) =>
            onCropChange({
              ...crop,
              zoom: clamp(Number(e.target.value), MIN_ZOOM, MAX_ZOOM),
            })
          }
          className="h-1 w-full accent-primary"
          aria-label="Zoom"
          disabled={!size}
        />
      </label>
    </div>
  );
}
