"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { addStory } from "@/app/actions/stories";
import { DateField } from "@/components/date-field";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { CompanionPicker, type CompanionOption } from "@/components/tree/companion-picker";
import { StoryRecordingField, type RecordingChoice } from "@/components/tree/story-recording-field";
import { StoryTextFields } from "@/components/tree/story-text-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import { isRedirect } from "@/lib/action-feedback";
import type { EntryStory } from "@/lib/stories";
import { STORY_CREDIT_MAX, toldProblem, type StoryCreditRole } from "@/lib/story-credits";
import { AUDIO_NOT_SENT } from "@/lib/story-upload";

const NO_RECORDING: RecordingChoice = { kind: "none" };

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
  // Bumped on each opening: the title and story fields start afresh.
  const [formKey, setFormKey] = React.useState(0);
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

  const ready = recording.kind === "new" ? recording.audio : null;
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
          <StoryTextFields
            key={formKey}
            idPrefix="story"
            title={title}
            onTitle={setTitle}
            body={body}
            onBody={setBody}
            disabled={send.pending}
          />
          <StoryRecordingField
            key={formKey}
            existing={null}
            disabled={send.pending}
            onChange={setRecording}
            onPreparing={setPreparing}
          />
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
