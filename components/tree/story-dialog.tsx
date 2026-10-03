"use client";

import * as React from "react";
import { Mic, PenLine, Plus } from "lucide-react";

import { addStory } from "@/app/actions/stories";
import { DateField } from "@/components/date-field";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { CompanionPicker, type CompanionOption } from "@/components/tree/companion-picker";
import { StoryRecordingField, type RecordingChoice } from "@/components/tree/story-recording-field";
import { StoryTextFields } from "@/components/tree/story-text-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import { isRedirect } from "@/lib/action-feedback";
import type { EntryStory } from "@/lib/stories";
import { STORY_CREDIT_MAX, toldProblem, type StoryCreditRole } from "@/lib/story-credits";
import { STORY_MAX, STORY_TITLE_MAX } from "@/lib/limits";
import { AUDIO_NOT_SENT } from "@/lib/story-upload";
import { cn } from "@/lib/utils";

const NO_RECORDING: RecordingChoice = { kind: "none" };

/** What's being added (Step 113): a story written here, or a recording. */
type StoryKind = "write" | "record";

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
 * Tell a story about someone (Step 88.3). It first asks which (Step 113):
 * **write a story**, in a big window with room for a whole one, or **upload
 * a recording**; either may have a title. It may say when it was told and
 * credit people on the tree as its storytellers and interviewers (Step 99).
 * A picked recording is shrunk as soon as it's picked, and played back here
 * before it goes. A form is its labels. Loaded only once someone opens it.
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
  // Bumped on each opening: the title and story fields start afresh.
  const [formKey, setFormKey] = React.useState(0);
  // Null until one is picked.
  const [kind, setKind] = React.useState<StoryKind | null>(null);
  const [told, setTold] = React.useState("");
  // "+ Date told" pressed, or the date typed in: the field stays.
  const [toldOpened, setToldOpened] = React.useState(false);
  const [toldTouched, setToldTouched] = React.useState(false);
  const focusTold = React.useRef(false);
  const [credits, setCredits] = React.useState(EMPTY_CREDITS);
  const [creditsShown, setCreditsShown] = React.useState(NONE_SHOWN);
  const [recording, setRecording] = React.useState<RecordingChoice>(NO_RECORDING);
  const [preparing, setPreparing] = React.useState(false);

  // Opened afresh, empty.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle("");
      setBody("");
      setFormKey((k) => k + 1);
      setKind(null);
      setTold("");
      setToldOpened(false);
      setToldTouched(false);
      setCredits(EMPTY_CREDITS);
      setCreditsShown(NONE_SHOWN);
      setRecording(NO_RECORDING);
      setPreparing(false);
      send.setError(null);
    }
  }

  const toldShown = toldOpened || told !== "";
  React.useEffect(() => {
    if (!toldShown || !focusTold.current) return;
    focusTold.current = false;
    document.getElementById("story-told")?.focus();
  }, [toldShown]);
  const toldError = toldProblem(told);

  const writing = kind === "write";
  const ready = kind === "record" && recording.kind === "new" ? recording.audio : null;
  const length = body.trim().length;
  const canSend =
    !preparing && (writing ? length > 0 && length <= STORY_MAX : ready !== null);

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
            body: writing ? body : "",
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
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] overflow-y-auto",
          writing ? "sm:max-w-4xl" : "sm:max-w-lg",
        )}
      >
        <DialogTitle>
          {kind === "write"
            ? "Write a story"
            : kind === "record"
              ? "Upload a recording"
              : "Add a story"}
        </DialogTitle>
        {kind === null ? (
          <div className="grid gap-2 pt-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto flex-col gap-2 py-6"
              onClick={() => setKind("write")}
            >
              <PenLine aria-hidden className="size-5" />
              write a story
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto flex-col gap-2 py-6"
              onClick={() => setKind("record")}
            >
              <Mic aria-hidden className="size-5" />
              upload a recording
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 pt-2">
            {writing ? (
              <StoryTextFields
                key={formKey}
                idPrefix="story"
                title={title}
                onTitle={setTitle}
                body={body}
                onBody={setBody}
                disabled={send.pending}
                roomy
              />
            ) : (
              <>
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
                <StoryRecordingField
                  key={formKey}
                  existing={null}
                  disabled={send.pending}
                  onChange={setRecording}
                  onPreparing={setPreparing}
                />
              </>
            )}
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
                pendingLabel="adding…"
              >
                add
              </PendingButton>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={send.pending}
                onClick={() => {
                  // A recording being readied goes with its field.
                  setRecording(NO_RECORDING);
                  setPreparing(false);
                  setKind(null);
                }}
              >
                back
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={send.pending}
                onClick={() => onOpenChange(false)}
              >
                cancel
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
