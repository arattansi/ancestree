"use client";

import * as React from "react";
import { PenLineIcon, Undo2Icon, XIcon } from "lucide-react";

import { InkDrawing } from "@/components/birthday-card/ink-drawing";
import { Button } from "@/components/ui/button";
import {
  boxChars,
  inkPoint,
  INK_BOX_MAX_CHARS,
  INK_MAX_STROKES,
  strokePath,
  worthAdding,
  type InkBox,
  type InkDraft,
  type InkStroke,
} from "@/lib/card-ink";
import { cn } from "@/lib/utils";

// Ink is for a finger or a pencil (decision 15): a phone or a tablet.
const TOUCH = "(pointer: coarse)";

/** Whether this screen is driven by a finger, as it changes. The server says no. */
export function useTouchScreen(): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(TOUCH);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(TOUCH).matches,
    () => false,
  );
}

/** Coalesced points too, where the browser has them: a smoother line at speed. */
function pointsOf(e: React.PointerEvent): PointerEvent[] {
  const native = e.nativeEvent;
  const coalesced = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
  return coalesced.length > 0 ? coalesced : [native];
}

const PROMPT: Record<InkBox, string> = { draw: "draw here", sign: "sign here" };

/**
 * A box to draw or sign in with a finger or a pencil (Step 217.4), on a
 * touch screen: a square for a drawing, a strip for a name. Pointer Events,
 * coalesced, with pressure; the page doesn't scroll under the pen. Each
 * stroke is handed up once it's finished; undo takes the last off, clear
 * all of them. A mouse doesn't draw (decision 15).
 */
export function InkPad({
  box,
  value,
  onChange,
  disabled,
  label,
}: {
  box: InkBox;
  value: InkStroke[] | null;
  onChange: (strokes: InkStroke[] | null) => void;
  disabled?: boolean;
  /** "your signature", for a screen reader. */
  label: string;
}) {
  const frame = React.useRef<HTMLDivElement | null>(null);
  const canvas = React.useRef<HTMLCanvasElement | null>(null);
  const strokes = React.useRef<InkStroke[]>(value ?? []);
  const current = React.useRef<{ id: number; stroke: InkStroke } | null>(null);
  // When this box's first touch was, so each point says when it was drawn.
  const origin = React.useRef<number | null>(null);
  const pending = React.useRef(0);
  const [full, setFull] = React.useState(false);
  const empty = !value || value.length === 0;

  const paint = React.useCallback(() => {
    pending.current = 0;
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const width = el.width / ratio;
    const height = el.height / ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getComputedStyle(el).color;
    for (const s of strokes.current) ctx.fill(new Path2D(strokePath(s, box, width, height)));
    const live = current.current?.stroke;
    if (live) ctx.fill(new Path2D(strokePath(live, box, width, height, false)));
  }, [box]);

  const schedule = React.useCallback(() => {
    if (!pending.current) pending.current = requestAnimationFrame(paint);
  }, [paint]);

  // The strokes as the form holds them: after an undo, a clear, a reset.
  React.useEffect(() => {
    if (current.current) return;
    strokes.current = value ?? [];
    if (strokes.current.length === 0) origin.current = null;
    schedule();
  }, [value, schedule]);

  // Sharp at the screen's own pixels, redrawn as the box changes size.
  React.useEffect(() => {
    const el = canvas.current;
    const holder = frame.current;
    if (!el || !holder) return;
    const fit = () => {
      const { width, height } = holder.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      el.width = Math.round(width * ratio);
      el.height = Math.round(height * ratio);
      paint();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(holder);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(pending.current);
    };
  }, [paint]);

  const add = (e: PointerEvent, stroke: InkStroke) => {
    const rect = canvas.current!.getBoundingClientRect();
    const point = inkPoint(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
      e.pointerType === "pen" ? e.pressure : 0,
      e.timeStamp - (origin.current ?? e.timeStamp),
    );
    if (worthAdding(stroke, point, box)) stroke.push(point);
  };

  const finish = (e: React.PointerEvent) => {
    const live = current.current;
    if (!live || live.id !== e.pointerId) return;
    current.current = null;
    const next = [...strokes.current, live.stroke];
    if (boxChars(next) > INK_BOX_MAX_CHARS) {
      setFull(true);
      schedule();
      return;
    }
    strokes.current = next;
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={frame}
        className={cn(
          "relative w-full overflow-hidden rounded-lg border border-dashed border-kraft-line bg-cake-sponge text-foreground",
          box === "draw" ? "aspect-square max-w-80" : "aspect-[4/1]",
          disabled && "opacity-60",
        )}
      >
        {box === "sign" ? (
          <span aria-hidden className="pointer-events-none absolute inset-x-4 bottom-[22%] border-b border-kraft-line/70" />
        ) : null}
        {empty ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
          >
            {PROMPT[box]}
          </span>
        ) : null}
        <canvas
          ref={canvas}
          role="img"
          aria-label={label}
          className="absolute inset-0 size-full touch-none select-none"
          onPointerDown={(e) => {
            if (disabled || e.pointerType === "mouse" || current.current) return;
            if (strokes.current.length >= INK_MAX_STROKES) {
              setFull(true);
              return;
            }
            e.preventDefault();
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // A pointer already gone: its moves still come here while it's over the box.
            }
            if (origin.current === null) {
              // Kept ink carries on after its last point.
              const last = strokes.current.at(-1)?.at(-1)?.[3];
              origin.current = e.timeStamp - (last === undefined ? 0 : last + 300);
            }
            const stroke: InkStroke = [];
            add(e.nativeEvent, stroke);
            current.current = { id: e.pointerId, stroke };
            schedule();
          }}
          onPointerMove={(e) => {
            const live = current.current;
            if (!live || live.id !== e.pointerId) return;
            for (const p of pointsOf(e)) add(p, live.stroke);
            schedule();
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
        />
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || empty}
          onClick={() => {
            setFull(false);
            onChange(value && value.length > 1 ? value.slice(0, -1) : null);
          }}
        >
          <Undo2Icon aria-hidden />
          undo
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || empty}
          onClick={() => {
            setFull(false);
            onChange(null);
          }}
        >
          clear
        </Button>
        {full ? <span className="text-[13px] text-muted-foreground">that’s as much as fits.</span> : null}
      </div>
    </div>
  );
}

/**
 * A signature's ink in a signing form (Step 217.4). On a touch screen: the
 * strip to sign a name in, under the message, and a square to draw in,
 * opened by "draw something". Anywhere else nothing to draw with, but ink
 * already on the signature (made on a phone) shows, kept unless taken off.
 * `part` picks which this renders, so the form can place each.
 */
export function InkField({
  part,
  value,
  onChange,
  disabled,
}: {
  part: InkBox;
  value: InkDraft;
  onChange: (draft: InkDraft) => void;
  disabled?: boolean;
}) {
  const touch = useTouchScreen();
  const strokes = value[part];
  const [drawing, setDrawing] = React.useState(false);
  const set = (next: InkStroke[] | null) => onChange({ ...value, [part]: next });
  const label = part === "sign" ? "your signature" : "your drawing";

  if (!touch) {
    if (!strokes || strokes.length === 0) return null;
    return (
      <div className="flex items-start gap-2">
        <div className="rounded-lg border border-kraft-line/40 bg-cake-sponge p-2">
          <InkDrawing box={part} strokes={strokes} label={label} className={part === "sign" ? "h-12" : "h-28"} />
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`remove ${label}`}
          disabled={disabled}
          onClick={() => set(null)}
        >
          <XIcon aria-hidden />
        </Button>
      </div>
    );
  }

  if (part === "sign") {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">sign your name</span>
        <InkPad box="sign" value={strokes} onChange={set} disabled={disabled} label={label} />
      </div>
    );
  }

  if (!drawing && (!strokes || strokes.length === 0)) {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-11 self-start"
        disabled={disabled}
        onClick={() => setDrawing(true)}
      >
        <PenLineIcon aria-hidden />
        draw something
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium">your drawing</span>
      <InkPad box="draw" value={strokes} onChange={set} disabled={disabled} label={label} />
    </div>
  );
}
