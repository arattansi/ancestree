"use client";

import * as React from "react";
import { Mic, X } from "lucide-react";

import { addStory } from "@/app/actions/stories";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import { isRedirect } from "@/lib/action-feedback";
import { STORY_MAX, STORY_TITLE_MAX } from "@/lib/limits";
import type { EntryStory } from "@/lib/stories";
import { formatDuration } from "@/lib/story-audio";
import type { StoryAudio } from "@/lib/story-audio-shrink";
import { AUDIO_NOT_SENT } from "@/lib/story-upload";

type Recording =
  | { state: "preparing"; progress: number }
  | ({ state: "ready"; url: string; name: string } & StoryAudio);

/**
 * Tell a story about someone (Step 88.3): a title, the story, a recording,
 * or any of them but the title alone. A picked recording is shrunk as soon
 * as it's picked, and played back here before it goes. A form is its labels.
 * Loaded only once someone opens it.
 */
export function StoryDialog({
  open,
  onOpenChange,
  personId,
  treeId,
  onTold,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  /** The tree it's told on, whose inbox its teller hears back in. */
  treeId: string;
  /** Told: the entry's stories now, when they could be read. */
  onTold: (stories: EntryStory[] | undefined) => void;
}) {
  const send = useAction({ inline: true });
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [recording, setRecording] = React.useState<Recording | null>(null);
  const [recordingError, setRecordingError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  // Which pick is being prepared: a later pick, or a closed dialog, drops
  // an earlier one's result.
  const pick = React.useRef(0);

  // Opened afresh, empty.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle("");
      setBody("");
      setRecording(null);
      setRecordingError(null);
      send.setError(null);
    }
  }

  // A played-back recording's link goes with it.
  const url = recording?.state === "ready" ? recording.url : null;
  React.useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  React.useEffect(() => {
    if (!open) pick.current += 1;
  }, [open]);

  async function onPick(file: File) {
    const mine = ++pick.current;
    setRecordingError(null);
    setRecording({ state: "preparing", progress: 0 });
    try {
      const { prepareStoryAudio } = await import("@/lib/story-audio-shrink");
      const res = await prepareStoryAudio(file, (progress) => {
        if (pick.current === mine) setRecording({ state: "preparing", progress });
      });
      if (pick.current !== mine) return;
      if ("error" in res) {
        setRecording(null);
        setRecordingError(res.error);
        return;
      }
      setRecording({
        state: "ready",
        ...res,
        url: URL.createObjectURL(res.blob),
        name: file.name,
      });
    } catch {
      if (pick.current !== mine) return;
      setRecording(null);
      setRecordingError("That recording couldn’t be read.");
    }
  }

  const ready = recording?.state === "ready" ? recording : null;
  const preparing = recording?.state === "preparing";
  const progress = recording?.state === "preparing" ? recording.progress : 0;
  const canSend = !preparing && (body.trim().length > 0 || ready !== null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    const audio = ready;
    send.run(
      "send",
      async () => {
        let audioPath: string | null = null;
        if (audio) {
          const { uploadStoryAudio } = await import("@/lib/story-upload");
          try {
            audioPath = await uploadStoryAudio(personId, audio);
          } catch {
            return { error: AUDIO_NOT_SENT };
          }
        }
        try {
          const res = await addStory({
            personId,
            treeId,
            title,
            body,
            audioPath,
            audioSeconds: audio?.seconds ?? null,
          });
          // Refused: the recording nothing took goes again.
          if (res.error && audioPath) {
            const { discardStoryAudio } = await import("@/lib/story-upload");
            await discardStoryAudio(audioPath);
          }
          return res;
        } catch (thrown) {
          // Unreachable: the story may have arrived, so the recording stays.
          if (isRedirect(thrown)) throw thrown;
          return { error: "Couldn’t add it. Try again." };
        }
      },
      {
        success: (res) =>
          res.status === "pending" ? "Sent for approval." : null,
        onSuccess: (res) => {
          onTold(res.stories);
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!send.pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Add a story</DialogTitle>
        <form onSubmit={onSubmit} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="story-title">Title</Label>
            <Input
              id="story-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={STORY_TITLE_MAX}
              disabled={send.pending}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="story-body">Story</Label>
            <Textarea
              id="story-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              maxLength={STORY_MAX}
              disabled={send.pending}
              className="max-h-[50dvh]"
            />
          </div>
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
                    disabled={send.pending}
                    onClick={() => setRecording(null)}
                  >
                    <X aria-hidden />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="self-start"
                disabled={preparing || send.pending}
                onClick={() => fileRef.current?.click()}
              >
                <Mic aria-hidden />
                {preparing
                  ? `Preparing… ${Math.round(progress * 100)}%`
                  : "Add a recording"}
              </Button>
            )}
            <FormError>{recordingError}</FormError>
          </div>
          <FormError>{send.error}</FormError>
          <div className="flex gap-2">
            <PendingButton
              type="submit"
              size="sm"
              pending={send.pending}
              disabled={!canSend}
              pendingLabel="Adding…"
            >
              Add
            </PendingButton>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={send.pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
