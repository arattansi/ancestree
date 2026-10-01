"use client";

import * as React from "react";
import { FileText, Mic, Plus, X } from "lucide-react";

import { addStory } from "@/app/actions/stories";
import { DateField } from "@/components/date-field";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { CompanionPicker, type CompanionOption } from "@/components/tree/companion-picker";
import { StoryText } from "@/components/tree/story-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import { isRedirect } from "@/lib/action-feedback";
import { STORY_MAX, STORY_TITLE_MAX } from "@/lib/limits";
import type { EntryStory } from "@/lib/stories";
import { STORY_CREDIT_MAX, toldProblem, type StoryCreditRole } from "@/lib/story-credits";
import {
  STORY_FILE_ACCEPT,
  STORY_FILE_MAX_BYTES,
  addToStory,
  readStoryFile,
} from "@/lib/story-markdown";
import { formatDuration } from "@/lib/story-audio";
import type { StoryAudio } from "@/lib/story-audio-shrink";
import { AUDIO_NOT_SENT } from "@/lib/story-upload";

type Recording =
  | { state: "preparing"; progress: number }
  | ({ state: "ready"; url: string; name: string } & StoryAudio);

/**
 * One role's people on a story (Step 99): a link to add some, and once
 * pressed, a picker over the people on the tree.
 */
function CreditField({
  label,
  people,
  value,
  shown,
  onShow,
  onChange,
  disabled,
}: {
  label: string;
  people: CompanionOption[];
  value: string[];
  shown: boolean;
  onShow: () => void;
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const focus = React.useRef(false);
  const visible = shown || value.length > 0;
  React.useEffect(() => {
    if (!visible || !focus.current) return;
    focus.current = false;
    ref.current?.querySelector("input")?.focus();
  }, [visible]);
  if (!visible) {
    return (
      <Button
        type="button"
        variant="link"
        size="sm"
        className="self-start px-0"
        disabled={disabled}
        onClick={() => {
          focus.current = true;
          onShow();
        }}
      >
        <Plus aria-hidden />
        {label}
      </Button>
    );
  }
  return (
    <div ref={ref}>
      <CompanionPicker
        label={label}
        options={people}
        value={value}
        onChange={(ids) => onChange(ids.slice(0, STORY_CREDIT_MAX))}
        disabled={disabled}
        emptyHint={null}
      />
    </div>
  );
}

const EMPTY_CREDITS: Record<StoryCreditRole, string[]> = {
  storyteller: [],
  interviewer: [],
};
const NONE_SHOWN: Record<StoryCreditRole, boolean> = {
  storyteller: false,
  interviewer: false,
};

/**
 * Tell a story about someone (Step 88.3): a title, the story, a recording,
 * or any of them but the title alone. The story is written in Markdown, with
 * a preview, or comes from a Markdown file (Step 99), which can name its
 * title. It may say when it was told and credit people on the tree as its
 * storytellers and interviewers (Step 99). A picked recording is shrunk as
 * soon as it's picked, and played back here before it goes. A form is its
 * labels. Loaded only once someone opens it.
 */
export function StoryDialog({
  open,
  onOpenChange,
  personId,
  treeId,
  people,
  onTold,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  /** The tree it's told on, whose inbox its teller hears back in. */
  treeId: string;
  /** Everyone on the canvas, who may be credited. */
  people: CompanionOption[];
  /** Told: the entry's stories now, when they could be read. */
  onTold: (stories: EntryStory[] | undefined) => void;
}) {
  const send = useAction({ inline: true });
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [preview, setPreview] = React.useState(false);
  const [fileError, setFileError] = React.useState<string | null>(null);
  // A Markdown file being read: the title and story wait, so nothing typed
  // meanwhile is written over.
  const [readingFile, setReadingFile] = React.useState(false);
  const [told, setTold] = React.useState("");
  // "+ Date told" pressed, or the date typed in: the field stays.
  const [toldOpened, setToldOpened] = React.useState(false);
  const [toldTouched, setToldTouched] = React.useState(false);
  const focusTold = React.useRef(false);
  const [credits, setCredits] = React.useState(EMPTY_CREDITS);
  const [creditsShown, setCreditsShown] = React.useState(NONE_SHOWN);
  const [recording, setRecording] = React.useState<Recording | null>(null);
  const [recordingError, setRecordingError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const markdownRef = React.useRef<HTMLInputElement>(null);
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
      setPreview(false);
      setFileError(null);
      setTold("");
      setToldOpened(false);
      setToldTouched(false);
      setCredits(EMPTY_CREDITS);
      setCreditsShown(NONE_SHOWN);
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

  const toldShown = toldOpened || told !== "";
  React.useEffect(() => {
    if (!toldShown || !focusTold.current) return;
    focusTold.current = false;
    document.getElementById("story-told")?.focus();
  }, [toldShown]);
  const toldError = toldProblem(told);

  // A Markdown file's text goes into the story, after what's written; its
  // title into the title if that's empty.
  async function onMarkdownFile(file: File) {
    setFileError(null);
    if (file.size > STORY_FILE_MAX_BYTES) {
      setFileError("That file is too big for a story.");
      return;
    }
    let text: string;
    setReadingFile(true);
    try {
      text = await file.text();
    } catch {
      setFileError("That file couldn’t be read.");
      return;
    } finally {
      setReadingFile(false);
    }
    if (text.includes("\u0000")) {
      setFileError("That isn’t a text file.");
      return;
    }
    const read = readStoryFile(text, STORY_TITLE_MAX);
    if (!read.body) {
      setFileError("That file is empty.");
      return;
    }
    const next = addToStory(body, read.body);
    if (next.length > STORY_MAX) {
      setFileError(
        `That’s longer than a story may be (${STORY_MAX.toLocaleString("en")} characters).`,
      );
      return;
    }
    setBody(next);
    if (!title.trim() && read.title) setTitle(read.title);
  }

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
    setToldTouched(true);
    if (!canSend || toldError) return;
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
            told,
            storytellers: credits.storyteller,
            interviewers: credits.interviewer,
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
              disabled={send.pending || readingFile}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              {/* In Preview there's no box to name: the preview names itself. */}
              <Label htmlFor={preview ? undefined : "story-body"}>Story</Label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={preview ? "ghost" : "secondary"}
                  aria-pressed={!preview}
                  onClick={() => setPreview(false)}
                >
                  Write
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={preview ? "secondary" : "ghost"}
                  aria-pressed={preview}
                  onClick={() => setPreview(true)}
                >
                  Preview
                </Button>
              </div>
            </div>
            {preview ? (
              <div
                role="region"
                aria-label="Preview of the story"
                className="max-h-[50dvh] min-h-40 overflow-y-auto rounded-md border p-3 text-sm"
              >
                {body.trim() ? (
                  <StoryText>{body}</StoryText>
                ) : (
                  <p className="text-muted-foreground">Nothing to preview.</p>
                )}
              </div>
            ) : (
              <Textarea
                id="story-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                maxLength={STORY_MAX}
                disabled={send.pending || readingFile}
                className="max-h-[50dvh]"
              />
            )}
            <input
              ref={markdownRef}
              type="file"
              accept={STORY_FILE_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void onMarkdownFile(file);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-start"
              disabled={send.pending || readingFile}
              onClick={() => markdownRef.current?.click()}
            >
              <FileText aria-hidden />
              Upload a Markdown file
            </Button>
            <FormError>{fileError}</FormError>
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
          {toldShown ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="story-told">Date told</Label>
              <DateField
                id="story-told"
                value={told}
                onChange={(value) => {
                  setTold(value);
                  setToldOpened(true);
                }}
                onBlur={() => setToldTouched(true)}
                disabled={send.pending}
                aria-invalid={toldTouched && !!toldError}
              />
              <FormError>{toldTouched ? toldError : null}</FormError>
            </div>
          ) : (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="self-start px-0"
              disabled={send.pending}
              onClick={() => {
                focusTold.current = true;
                setToldOpened(true);
              }}
            >
              <Plus aria-hidden />
              Date told
            </Button>
          )}
          <CreditField
            label="Storyteller"
            people={people}
            value={credits.storyteller}
            shown={creditsShown.storyteller}
            onShow={() => setCreditsShown((s) => ({ ...s, storyteller: true }))}
            onChange={(ids) => setCredits((c) => ({ ...c, storyteller: ids }))}
            disabled={send.pending}
          />
          <CreditField
            label="Interviewer"
            people={people}
            value={credits.interviewer}
            shown={creditsShown.interviewer}
            onShow={() => setCreditsShown((s) => ({ ...s, interviewer: true }))}
            onChange={(ids) => setCredits((c) => ({ ...c, interviewer: ids }))}
            disabled={send.pending}
          />
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
