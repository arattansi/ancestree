"use client";

import * as React from "react";

import { setStoryDetails } from "@/app/actions/stories";
import { DateField } from "@/components/date-field";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { CompanionPicker, type CompanionOption } from "@/components/tree/companion-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import type { EntryStory } from "@/lib/stories";
import { toPartialIso } from "@/lib/partial-date";
import { STORY_CREDIT_MAX, toldProblem } from "@/lib/story-credits";

/**
 * Change who a story is credited to and when it was told, after it's told
 * (Steps 99.5, 99.6): its storytellers, interviewers and date, opened as
 * they are now. Anyone on the canvas may be added; someone credited already
 * stays offered by name even where this canvas doesn't have them. An empty
 * date clears it. Loaded only once someone opens it.
 */
export function StoryDetailsDialog({
  story,
  onClose,
  personId,
  treeId,
  people,
  onSaved,
}: {
  /** The story being credited; null while closed. */
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
  const [told, setTold] = React.useState("");
  const [toldTouched, setToldTouched] = React.useState(false);

  // Opened on a story: whoever it credits now.
  const [openedOn, setOpenedOn] = React.useState<string | null>(null);
  const storyId = story?.id ?? null;
  if (storyId !== openedOn) {
    setOpenedOn(storyId);
    if (story) {
      setTellers(story.credits.filter((c) => c.role === "storyteller").map((c) => c.id));
      setAskers(story.credits.filter((c) => c.role === "interviewer").map((c) => c.id));
      setTold(toPartialIso(story.toldOn, story.toldPrecision));
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
    if (!story || toldError) return;
    save.run(
      "save",
      () =>
        setStoryDetails({
          storyId: story.id,
          personId,
          treeId,
          storytellers: tellers,
          interviewers: askers,
          told,
        }),
      {
        onSuccess: (res) => {
          onSaved(res.stories);
          onClose();
        },
      },
    );
  }

  return (
    <Dialog
      open={!!story}
      onOpenChange={(next) => {
        if (!next && !save.pending) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Credits and date</DialogTitle>
        <form onSubmit={onSubmit} className="flex flex-col gap-4 pt-2">
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
          <FormError>{save.error}</FormError>
          <div className="flex gap-2">
            <PendingButton type="submit" size="sm" pending={save.pending} pendingLabel="Saving…">
              Save
            </PendingButton>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={save.pending}
              onClick={onClose}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
