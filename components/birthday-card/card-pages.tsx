"use client";

import * as React from "react";
import { PauseIcon, PlayIcon } from "lucide-react";

import { CardLeaf } from "@/components/birthday-card/card-leaf";
import { InkDrawing, replayLength } from "@/components/birthday-card/ink-drawing";
import type { CardSignatureView } from "@/lib/birthday-cards";
import type { LeafShape } from "@/lib/leaf-shapes";
import { formatDuration } from "@/lib/story-audio";
import { cn } from "@/lib/utils";

/** What a page knows about its signer beyond the card: their leaf, who they are. */
export type SignerOf = (signature: CardSignatureView) => {
  leaf: LeafShape | null;
  /** "your husband": what they are to whoever reads the card. */
  relation: string | null;
};

/**
 * A voice memo on a card (Step 217): play and pause, how far through, how
 * long. The file streams from its signed link only when it's played.
 */
export function VoiceMemo({
  url,
  seconds,
  name,
  className,
}: {
  url: string | null;
  seconds: number | null;
  name: string;
  className?: string;
}) {
  const audio = React.useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [done, setDone] = React.useState(0);
  if (!url) {
    return <p className="text-sm text-muted-foreground">the voice memo couldn’t be loaded.</p>;
  }
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-full border border-kraft-line/40 bg-background py-1.5 pr-4 pl-1.5",
        className,
      )}
    >
      <button
        type="button"
        aria-label={`${playing ? "pause" : "play"} ${name}’s voice memo`}
        onClick={() => {
          const el = audio.current;
          if (!el) return;
          if (el.paused) void el.play();
          else el.pause();
        }}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        {playing ? <PauseIcon className="size-4" aria-hidden /> : <PlayIcon className="size-4" aria-hidden />}
      </button>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-kraft/40" aria-hidden>
        <div className="h-full rounded-full bg-brand-brown" style={{ width: `${Math.round(done * 100)}%` }} />
      </div>
      <span className="text-[13px] text-muted-foreground tabular-nums">
        {seconds !== null ? formatDuration(seconds) : ""}
      </span>
      <audio
        ref={audio}
        src={url}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setDone(0);
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setDone(el.duration > 0 ? el.currentTime / el.duration : 0);
        }}
      />
    </div>
  );
}

/**
 * One signature, a page of the card. A name signed by hand takes the typed
 * name's place (Step 217.4); with `replay`, as the card opens, it writes
 * itself out again, then the drawing.
 */
export function CardPage({
  signature,
  signer,
  replay = false,
}: {
  signature: CardSignatureView;
  signer: SignerOf;
  replay?: boolean;
}) {
  const { leaf, relation } = signer(signature);
  const signed = signature.ink?.sign ?? null;
  const drawn = signature.ink?.draw ?? null;
  return (
    <article className="card-page-in flex h-full flex-col gap-5 overflow-y-auto p-6 sm:p-8">
      <div className="flex items-center gap-3">
        {leaf ? (
          <CardLeaf shape={leaf} />
        ) : (
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-full bg-kraft/40 text-base font-semibold text-muted-foreground"
          >
            {signature.name.slice(0, 1)}
          </span>
        )}
        <div className="flex min-w-0 flex-col">
          {signed ? (
            <InkDrawing
              box="sign"
              strokes={signed}
              label={signature.name}
              replay={replay}
              className="h-11 w-auto max-w-full self-start"
            />
          ) : (
            <span className="text-base font-semibold">{signature.name}</span>
          )}
          {relation ? <span className="text-[13px] text-muted-foreground">{relation}</span> : null}
        </div>
      </div>
      {signature.message ? (
        <p className="text-lg leading-relaxed whitespace-pre-line sm:text-xl">{signature.message}</p>
      ) : null}
      {drawn ? (
        <InkDrawing
          box="draw"
          strokes={drawn}
          label={`${signature.name}’s drawing`}
          replay={replay}
          delay={replay && signed ? replayLength(signed) + 250 : 0}
          className="w-full max-w-72"
        />
      ) : null}
      {signature.audioPath ? (
        <VoiceMemo url={signature.audioUrl} seconds={signature.audioSeconds} name={signature.name} />
      ) : null}
      {signature.photoPath ? (
        signature.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed link to a private bucket
          <img
            src={signature.photoUrl}
            alt={`${signature.name}’s photo`}
            className="max-h-80 w-full rounded-lg object-contain"
          />
        ) : (
          <p className="text-sm text-muted-foreground">the photo couldn’t be loaded.</p>
        )
      ) : null}
    </article>
  );
}

/**
 * A card's pages: one at a time on a phone, two side by side on a wide
 * screen, opened like a book, with previous and next. `onEnd` runs from the
 * last page's button.
 */
export function CardPages({
  signatures,
  signer,
  wide,
  endLabel,
  onEnd,
  onDark = false,
  replay = false,
}: {
  signatures: readonly CardSignatureView[];
  signer: SignerOf;
  wide: boolean;
  endLabel: string;
  onEnd: () => void;
  /** Over the dimmed page, as a card opens: light buttons. */
  onDark?: boolean;
  /** Each page's ink writes itself out as the page turns to it. */
  replay?: boolean;
}) {
  const per = wide ? 2 : 1;
  const [at, setAt] = React.useState(0);
  const pages = Math.max(1, Math.ceil(signatures.length / per));
  const first = Math.min(at, pages - 1) * per;
  const shown = signatures.slice(first, first + per);
  const last = first + per >= signatures.length;
  const counter =
    signatures.length === 0
      ? ""
      : per === 1 || shown.length === 1
        ? `${first + 1} of ${signatures.length}`
        : `${first + 1}–${first + shown.length} of ${signatures.length}`;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <p className={cn("self-end text-[13px]", onDark ? "text-white/75" : "text-muted-foreground")}>{counter}</p>
      <div
        className={cn(
          "relative grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-kraft-line/30 bg-cake-sponge text-foreground shadow-xl",
          wide ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {wide ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-1/2 w-5 -translate-x-1/2 bg-gradient-to-r from-transparent via-kraft-deep/15 to-transparent"
          />
        ) : null}
        {shown.length === 0 ? (
          <p className="p-8 text-muted-foreground">nobody has signed it yet.</p>
        ) : (
          shown.map((s) => <CardPage key={s.id} signature={s} signer={signer} replay={replay} />)
        )}
      </div>
      <div className="flex justify-between gap-3">
        <button
          type="button"
          onClick={() => setAt((a) => Math.max(0, a - 1))}
          disabled={first === 0}
          className={cn(
            "h-11 rounded-lg border px-4 text-[15px] font-semibold disabled:opacity-40",
            onDark ? "border-white/40 text-white" : "border-border bg-background",
          )}
        >
          previous
        </button>
        <button
          type="button"
          onClick={() => (last ? onEnd() : setAt((a) => a + 1))}
          className={cn(
            "h-11 rounded-lg px-5 text-[15px] font-semibold",
            onDark ? "bg-white text-neutral-900" : "bg-primary text-primary-foreground",
          )}
        >
          {last ? endLabel : "next"}
        </button>
      </div>
    </div>
  );
}
