"use client";

import * as React from "react";
import { Mic, Undo2, X } from "lucide-react";

import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/story-audio";
import type { StoryAudio } from "@/lib/story-audio-shrink";

type Picked =
  | { state: "preparing"; progress: number }
  | ({ state: "ready"; url: string; name: string } & StoryAudio);

/** What a story's recording is to be, as the form has it. */
export type RecordingChoice =
  /** The one it has (or none, if it has none). */
  | { kind: "keep" }
  /** None. */
  | { kind: "none" }
  /** A new one, shrunk and ready to upload. */
  | { kind: "new"; audio: StoryAudio };

/**
 * A story's recording (Step 88.3), as it's told and as its teller edits it
 * (Step 99.8): a picked file is shrunk as soon as it's picked and played back
 * before it goes; one the story has already plays here, to **Replace** or
 * **Remove** (and **Undo** that). The choice goes up through `onChange`;
 * remount it (`key`) to start afresh.
 */
export function StoryRecordingField({
  existing,
  disabled,
  onChange,
  onPreparing,
}: {
  /** The recording the story has, when it's being edited. */
  existing: { url: string | null; seconds: number | null } | null;
  disabled: boolean;
  onChange: (choice: RecordingChoice) => void;
  /** A picked file is being shrunk: nothing can go until it's ready. */
  onPreparing: (preparing: boolean) => void;
}) {
  const [picked, setPicked] = React.useState<Picked | null>(null);
  const [removed, setRemoved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  // Which pick is being prepared: a later pick, or leaving, drops an
  // earlier one's result.
  const pick = React.useRef(0);

  // A played-back recording's link goes with it.
  const url = picked?.state === "ready" ? picked.url : null;
  React.useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  React.useEffect(
    () => () => {
      pick.current += 1;
    },
    [],
  );

  const ready = picked?.state === "ready" ? picked : null;
  const preparing = picked?.state === "preparing";
  const progress = picked?.state === "preparing" ? picked.progress : 0;
  const keeping = !!existing && !removed;

  function choose(next: Picked | null, nextRemoved: boolean) {
    setPicked(next);
    setRemoved(nextRemoved);
    onPreparing(next?.state === "preparing");
    if (next?.state === "ready") {
      const { blob, type, ext, seconds } = next;
      onChange({ kind: "new", audio: { blob, type, ext, seconds } });
    } else if (next?.state !== "preparing") {
      onChange(existing && !nextRemoved ? { kind: "keep" } : { kind: "none" });
    }
  }

  async function onPick(file: File) {
    const mine = ++pick.current;
    setError(null);
    choose({ state: "preparing", progress: 0 }, removed);
    try {
      const { prepareStoryAudio } = await import("@/lib/story-audio-shrink");
      const res = await prepareStoryAudio(file, (p) => {
        if (pick.current === mine) setPicked({ state: "preparing", progress: p });
      });
      if (pick.current !== mine) return;
      if ("error" in res) {
        choose(null, removed);
        setError(res.error);
        return;
      }
      choose({ state: "ready", ...res, url: URL.createObjectURL(res.blob), name: file.name }, removed);
    } catch {
      if (pick.current !== mine) return;
      choose(null, removed);
      setError("That recording couldn’t be read.");
    }
  }

  const pickButton = (label: string) => (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="self-start"
      disabled={preparing || disabled}
      onClick={() => fileRef.current?.click()}
    >
      <Mic aria-hidden />
      {preparing ? `Preparing… ${Math.round(progress * 100)}%` : label}
    </Button>
  );

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Recording</span>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.m4a,.mp3,.ogg,.opus,.wav,.flac,.aac,.webm"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onPick(file);
        }}
      />
      {ready ? (
        <div className="flex flex-col gap-2 rounded-md border p-2">
          <audio controls src={ready.url} className="w-full" />
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">
              {ready.name}
              {ready.seconds ? ` · ${formatDuration(ready.seconds)}` : ""}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => choose(null, removed)}
            >
              <X aria-hidden />
              Remove
            </Button>
          </div>
        </div>
      ) : keeping && !preparing ? (
        <div className="flex flex-col gap-2 rounded-md border p-2">
          {existing.url ? (
            <audio controls preload="none" src={existing.url} className="w-full" />
          ) : null}
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{existing.seconds ? formatDuration(existing.seconds) : null}</span>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => fileRef.current?.click()}
              >
                <Mic aria-hidden />
                Replace
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => choose(null, true)}
              >
                <X aria-hidden />
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {pickButton("Add a recording")}
          {existing && removed && !preparing ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => choose(null, false)}
            >
              <Undo2 aria-hidden />
              Undo
            </Button>
          ) : null}
        </div>
      )}
      <FormError>{error}</FormError>
    </div>
  );
}
