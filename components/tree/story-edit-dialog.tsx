"use client";

import * as React from "react";

import { editStory } from "@/app/actions/stories";
import { DateField } from "@/components/date-field";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { CompanionPicker, type CompanionOption } from "@/components/tree/companion-picker";
import { StoryMentionsField } from "@/components/tree/story-mentions-field";
import { StoryRecordingField, type RecordingChoice } from "@/components/tree/story-recording-field";
import { StoryTextFields } from "@/components/tree/story-text-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import { isRedirect } from "@/lib/action-feedback";
import { STORY_MAX } from "@/lib/limits";
import type { EntryStory } from "@/lib/stories";
import { toPartialIso } from "@/lib/partial-date";
import { AUDIO_NOT_SENT } from "@/lib/story-upload";
import { cn } from "@/lib/utils";
import { STORY_CREDIT_MAX, toldProblem } from "@/lib/story-credits";

const KEEP: RecordingChoice = { kind: "keep" };

/**
 * Edit a story after it's told (Steps 99.5–99.8), opened as it is now: for
 * its teller, its title and text and its recording (replace or remove it)
 * as well as when it was told and who it's credited to; for whoever else may
 * (an editor of the entry, or the person it's about), the date and credits.
 * A written story opens in the big window it was written in (Step 113),
 * and its teller tags who it mentions there in place of credits (Step 116).
 * Anyone on the canvas may be credited; someone credited already stays
 * offered by name even where this canvas doesn't have them. An empty date
 * clears it. New words from someone who couldn't approve them go for
 * approval again. Loaded only once someone opens it.
 */
export function StoryEditDialog({
  story,
  onClose,
  personId,
  treeId,
  people,
  onSaved,
}: {
  /** The story being edited; null while closed. */
  story: EntryStory | null;
  onClose: () => void;
  personId: string;
  treeId: string;
  /** Everyone on the canvas, who may be credited. */
  people: CompanionOption[];
  /** Saved: the entry's stories now, when they could be read. */
  onSaved: (stories: EntryStory[] | undefined) => void;
}) {
  const save = useAction({ inline: true });
  const [tellers, setTellers] = React.useState<string[]>([]);
  const [askers, setAskers] = React.useState<string[]>([]);
  const [mentions, setMentions] = React.useState<string[]>([]);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [told, setTold] = React.useState("");
  const [recording, setRecording] = React.useState<RecordingChoice>(KEEP);
  const [preparing, setPreparing] = React.useState(false);
  const [toldTouched, setToldTouched] = React.useState(false);

  // Opened on a story: whoever it credits now.
  const [openedOn, setOpenedOn] = React.useState<string | null>(null);
  const storyId = story?.id ?? null;
  if (storyId !== openedOn) {
    setOpenedOn(storyId);
    if (story) {
      setTellers(story.credits.filter((c) => c.role === "storyteller").map((c) => c.id));
      setAskers(story.credits.filter((c) => c.role === "interviewer").map((c) => c.id));
      setMentions(story.mentions.map((m) => m.id));
      setTitle(story.title ?? "");
      setBody(story.body ?? "");
      setTold(toPartialIso(story.toldOn, story.toldPrecision));
      setRecording(KEEP);
      setPreparing(false);
      setToldTouched(false);
      save.setError(null);
    }
  }

  // The canvas's people, and anyone credited already that it doesn't have.
  const options = React.useMemo(() => {
    const known = new Set(people.map((p) => p.id));
    const extra = (story?.credits ?? [])
      .filter((c) => !known.has(c.id))
      .map((c) => ({ id: c.id, label: c.name }));
    return [...people, ...extra.filter((e, i, all) => all.findIndex((o) => o.id === e.id) === i)];
  }, [people, story]);

  const toldError = toldProblem(told);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setToldTouched(true);
    if (!story || toldError || preparing) return;
    // Only its teller changes its words, its recording, and who it mentions.
    const text = story.mine ? { title, body } : undefined;
    const tagged = story.mine && !story.hasRecording ? mentions : undefined;
    const choice = story.mine ? recording : KEEP;
    const wasWaiting = story.status === "pending";
    save.run(
      "save",
      async () => {
        // A new recording goes up first, into the person's folder.
        let audio: { path: string | null; seconds: number | null } | undefined;
        if (choice.kind === "new") {
          const { uploadStoryAudio } = await import("@/lib/story-upload");
          try {
            audio = {
              path: await uploadStoryAudio(personId, choice.audio),
              seconds: choice.audio.seconds,
            };
          } catch {
            return { error: AUDIO_NOT_SENT };
          }
        } else if (choice.kind === "none" && story.hasRecording) {
          audio = { path: null, seconds: null };
        }
        const uploaded = audio?.path ?? null;
        try {
          const res = await editStory({
            storyId: story.id,
            personId,
            treeId,
            storytellers: tellers,
            interviewers: askers,
            told,
            text,
            audio,
            mentions: tagged,
          });
          // Refused: the recording nothing took goes again.
          if (res.error && uploaded) {
            const { discardStoryAudio } = await import("@/lib/story-upload");
            await discardStoryAudio(uploaded);
          }
          return res;
        } catch (thrown) {
          // Unreachable: it may have saved, so the recording stays.
          if (isRedirect(thrown)) throw thrown;
          return { error: "Couldn’t save it. Try again." };
        }
      },
      {
        success: (res) =>
          res.status === "pending" && !wasWaiting ? "Sent for approval." : null,
        onSuccess: (res) => {
          onSaved(res.stories);
          onClose();
        },
      },
    );
  }

  // Its teller's written story: edited in the big window it was written in
  // (Step 113). A recording's text is its description (Step 115).
  const written = !!story?.mine && !!story.body && !story.hasRecording;

  return (
    <Dialog
      open={!!story}
      onOpenChange={(next) => {
        if (!next && !save.pending) onClose();
      }}
    >
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] overflow-y-auto",
          written ? "sm:max-w-4xl" : "sm:max-w-lg",
        )}
      >
        <DialogTitle>
          {story?.mine !== false
            ? "Edit story"
            : story.hasRecording
              ? "Credits and date"
              : "Date told"}
        </DialogTitle>
        <form onSubmit={onSubmit} className="flex flex-col gap-4 pt-2">
          {story?.mine ? (
            <StoryTextFields
              key={openedOn ?? ""}
              idPrefix="story-edit"
              title={title}
              onTitle={setTitle}
              body={body}
              onBody={setBody}
              disabled={save.pending}
              roomy={written}
              description={story.hasRecording}
            />
          ) : null}
          {story?.mine ? (
            <StoryRecordingField
              key={openedOn ?? ""}
              existing={
                story.hasRecording
                  ? { url: story.audioUrl, seconds: story.audioSeconds }
                  : null
              }
              disabled={save.pending}
              onChange={setRecording}
              onPreparing={setPreparing}
            />
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="story-edit-told">Date told</Label>
            <DateField
              id="story-edit-told"
              value={told}
              onChange={setTold}
              onBlur={() => setToldTouched(true)}
              disabled={save.pending}
              aria-invalid={toldTouched && !!toldError}
            />
            <FormError>{toldTouched ? toldError : null}</FormError>
          </div>
          {/* A recording is credited; a written story tags who it mentions,
              its teller alone (Step 116). */}
          {story && !story.hasRecording ? (
            story.mine ? (
              <StoryMentionsField
                key={openedOn ?? ""}
                people={people}
                personId={personId}
                body={body}
                value={mentions}
                onChange={setMentions}
                disabled={save.pending}
                known={story.mentions}
              />
            ) : null
          ) : (
            // Side by side where there's room (Step 117).
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <CompanionPicker
                label="Storyteller"
                options={options}
                value={tellers}
                onChange={(ids) => setTellers(ids.slice(0, STORY_CREDIT_MAX))}
                disabled={save.pending}
                emptyHint={null}
              />
              <CompanionPicker
                label="Interviewer"
                options={options}
                value={askers}
                onChange={(ids) => setAskers(ids.slice(0, STORY_CREDIT_MAX))}
                disabled={save.pending}
                emptyHint={null}
              />
            </div>
          )}
          <FormError>{save.error}</FormError>
          <div className="flex gap-2">
            <PendingButton
              type="submit"
              size="sm"
              pending={save.pending}
              disabled={preparing || body.trim().length > STORY_MAX}
              pendingLabel="saving…"
            >
              save
            </PendingButton>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={save.pending}
              onClick={onClose}
            >
              cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
