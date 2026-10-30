"use client";

import * as React from "react";
import { MicIcon, SquareIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CARD_FILE_TYPES, CARD_VOICE_SECONDS } from "@/lib/birthday-cards";
import { formatDuration } from "@/lib/story-audio";

/** A voice memo recorded here, ready to send, or one the signature has. */
export type VoiceTake =
  | { kind: "new"; blob: Blob; type: string; seconds: number; url: string }
  | { kind: "kept"; path: string; seconds: number | null; url: string | null };

/** What the browser can record, its own choice first among those the card keeps. */
function recorderType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
}

/**
 * Recording a voice memo for a birthday card in the browser (Step 217; the
 * web had no recording before: stories take a file). Press record, speak,
 * stop; it stops itself at two minutes. Then it's shrunk to speech-sized
 * AAC or Opus as a story's recording is (`prepareStoryAudio`), and can be
 * listened to, recorded again or removed.
 */
export function VoiceRecorder({
  value,
  onChange,
  disabled,
}: {
  value: VoiceTake | null;
  onChange: (take: VoiceTake | null) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = React.useState(false);
  const [preparing, setPreparing] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const recorder = React.useRef<MediaRecorder | null>(null);
  const tick = React.useRef<number | null>(null);
  const began = React.useRef(0);

  const stopTicking = () => {
    if (tick.current !== null) window.clearInterval(tick.current);
    tick.current = null;
  };

  React.useEffect(
    () => () => {
      stopTicking();
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const stop = React.useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  async function start() {
    setError(null);
    const type = recorderType();
    if (!navigator.mediaDevices?.getUserMedia || !type) {
      setError("This browser can’t record here.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Allow the microphone to record.");
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { mimeType: type });
    recorder.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = async () => {
      stopTicking();
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      const seconds = Math.min(CARD_VOICE_SECONDS, (Date.now() - began.current) / 1000);
      const baseType = type.split(";")[0];
      const raw = new Blob(chunks, { type: baseType });
      if (raw.size === 0) {
        setError("Nothing was recorded. Try again.");
        return;
      }
      setPreparing(true);
      try {
        const { prepareStoryAudio } = await import("@/lib/story-audio-shrink");
        const ext = baseType === "audio/mp4" ? "m4a" : baseType === "audio/ogg" ? "ogg" : "webm";
        const ready = await prepareStoryAudio(new File([raw], `memo.${ext}`, { type: baseType }));
        const take =
          "error" in ready
            ? CARD_FILE_TYPES[baseType]
              ? { blob: raw, type: baseType }
              : null
            : { blob: ready.blob, type: ready.type };
        if (!take) {
          setError("That recording can’t be kept. Try again.");
          return;
        }
        onChange({
          kind: "new",
          blob: take.blob,
          type: take.type,
          seconds: Math.round(seconds),
          url: URL.createObjectURL(take.blob),
        });
      } finally {
        setPreparing(false);
      }
    };
    began.current = Date.now();
    setElapsed(0);
    rec.start();
    setRecording(true);
    tick.current = window.setInterval(() => {
      const s = (Date.now() - began.current) / 1000;
      setElapsed(s);
      if (s >= CARD_VOICE_SECONDS) stop();
    }, 250);
  }

  if (recording) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
        <span className="size-2.5 animate-pulse rounded-full bg-destructive" aria-hidden />
        <span className="flex-1 text-sm tabular-nums" aria-live="polite">
          recording · {formatDuration(elapsed)} of {formatDuration(CARD_VOICE_SECONDS)}
        </span>
        <Button type="button" size="sm" variant="outline" onClick={stop}>
          <SquareIcon aria-hidden />
          stop
        </Button>
      </div>
    );
  }

  if (preparing) {
    return <p className="text-sm text-muted-foreground">getting it ready…</p>;
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-kraft-line/40 bg-cake-sponge py-1 pr-1 pl-3">
        <MicIcon className="size-4 shrink-0 text-brand-brown" aria-hidden />
        {value.url ? (
          <audio src={value.url} controls preload="none" className="h-8 min-w-0 flex-1" />
        ) : (
          <span className="flex-1 text-sm">voice memo</span>
        )}
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {value.seconds !== null ? formatDuration(value.seconds) : ""}
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="remove voice memo"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          <XIcon aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" disabled={disabled} onClick={() => void start()} className="self-start">
        <MicIcon aria-hidden />
        record
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
