"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Mic, Plus } from "lucide-react";

import { decideStory, deleteStory, getEntryStories } from "@/app/actions/stories";
import { ActionButton } from "@/components/action-button";
import { ConfirmButton } from "@/components/confirm-dialog";
import { RowCard, RowList } from "@/components/row-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EntryStory } from "@/lib/stories";
import { formatDuration } from "@/lib/story-audio";
import { isLongStory } from "@/lib/story-text";
import { timeAgo } from "@/lib/time-ago";

// Opened by a press, so it and what it loads wait for one (Step 87.4).
const StoryDialog = dynamic(
  () => import("@/components/tree/story-dialog").then((m) => m.StoryDialog),
  { ssr: false },
);

/**
 * One story (Step 88.3): its title, who told it and when, the text (folded
 * when it's long) and the recording. Whoever may approve a waiting story
 * answers it here; its teller, or whoever can edit the entry, may delete it.
 */
function StoryCard({
  story,
  canDelete,
  onDecided,
  onDeleted,
}: {
  story: EntryStory;
  canDelete: boolean;
  onDecided: (approved: boolean) => void;
  onDeleted: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const long = story.body ? isLongStory(story.body) : false;
  return (
    <RowCard className="gap-2">
      {story.title ? <p className="font-medium">{story.title}</p> : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {story.mine ? "You" : story.toldBy}
        </span>
        <span>{timeAgo(story.createdAt)}</span>
        {story.audioSeconds ? (
          <span className="flex items-center gap-1">
            <Mic aria-hidden className="size-3" />
            {formatDuration(story.audioSeconds)}
          </span>
        ) : null}
        {story.status === "pending" ? (
          <Badge variant="secondary">Waiting for approval</Badge>
        ) : story.status === "declined" ? (
          <Badge variant="destructive">Not approved</Badge>
        ) : null}
      </div>
      {story.body ? (
        <div className="flex flex-col items-start gap-1">
          <p
            className={
              long && !expanded
                ? "line-clamp-6 whitespace-pre-wrap"
                : "whitespace-pre-wrap"
            }
          >
            {story.body}
          </p>
          {long ? (
            <button
              type="button"
              className="text-xs font-medium underline underline-offset-2"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          ) : null}
        </div>
      ) : null}
      {story.audioUrl ? (
        <audio controls preload="none" src={story.audioUrl} className="w-full" />
      ) : null}
      <div className="flex flex-wrap gap-2 empty:hidden">
        {story.canDecide ? (
          <>
            <ActionButton
              size="sm"
              action={() => decideStory(story.id, true)}
              pendingLabel="Approving…"
              onSuccess={() => onDecided(true)}
            >
              Approve
            </ActionButton>
            <ActionButton
              size="sm"
              variant="outline"
              action={() => decideStory(story.id, false)}
              pendingLabel="Declining…"
              removesRow={!story.mine}
              onSuccess={() => onDecided(false)}
            >
              Decline
            </ActionButton>
          </>
        ) : null}
        {canDelete ? (
          <ConfirmButton
            size="sm"
            variant="ghost"
            className="text-destructive"
            confirm={{
              title: "Delete this story?",
              description: "This cannot be undone.",
              confirmLabel: "Delete",
              pendingLabel: "Deleting…",
              onConfirm: () => deleteStory(story.id),
              onSuccess: onDeleted,
            }}
          >
            Delete
          </ConfirmButton>
        ) : null}
      </div>
    </RowCard>
  );
}

/**
 * The stories about someone (Step 88.3), in place of the comments board
 * they replaced: those the viewer may see, newest first, and a way to add
 * one. Read when the entry opens; told, answered and deleted here, so the
 * list keeps itself without the page being drawn again.
 */
export function EntryStories({
  personId,
  treeId,
  canEdit,
}: {
  personId: string;
  /** The tree they're read on, which a new one is told on. */
  treeId: string;
  /** The viewer may edit the entry, so may delete any story on it. */
  canEdit: boolean;
}) {
  const [state, setState] = React.useState<{
    personId: string;
    items: EntryStory[] | null;
    failed: boolean;
  }>({ personId, items: null, failed: false });
  const [adding, setAdding] = React.useState(false);
  // Mounted from the first press on, so it can close with its animation.
  const [dialogMounted, setDialogMounted] = React.useState(false);
  const [version, setVersion] = React.useState(0);

  // The stories of the person being viewed; `null` while (re)loading.
  const current = state.personId === personId ? state : null;
  const items = current?.items ?? null;

  React.useEffect(() => {
    let active = true;
    getEntryStories(personId).then(
      (rows) => {
        if (active) setState({ personId, items: rows, failed: false });
      },
      () => {
        if (active) setState({ personId, items: null, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [personId, version]);

  // Another person, and what was being written for the last one goes.
  const [prevPerson, setPrevPerson] = React.useState(personId);
  if (personId !== prevPerson) {
    setPrevPerson(personId);
    setAdding(false);
  }

  function update(change: (items: EntryStory[]) => EntryStory[]) {
    setState((cur) =>
      cur.personId === personId && cur.items
        ? { ...cur, items: change(cur.items) }
        : cur,
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="stories-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="stories-heading" className="text-sm font-semibold">
          Stories
        </h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setDialogMounted(true);
            setAdding(true);
          }}
        >
          <Plus aria-hidden />
          Add
        </Button>
      </div>

      {current?.failed ? (
        <p className="text-sm text-muted-foreground">
          Couldn’t load the stories.{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => setVersion((v) => v + 1)}
          >
            Try again
          </button>
        </p>
      ) : items === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <RowList items={items} empty="No stories yet.">
          {(story) => (
            <StoryCard
              key={story.id}
              story={story}
              canDelete={story.mine || canEdit}
              onDecided={(approved) =>
                update((all) =>
                  approved || story.mine
                    ? all.map((s) =>
                        s.id === story.id
                          ? {
                              ...s,
                              status: approved ? "approved" : "declined",
                              canDecide: false,
                            }
                          : s,
                      )
                    : // Declined, it's its teller's alone to see.
                      all.filter((s) => s.id !== story.id),
                )
              }
              onDeleted={() => update((all) => all.filter((s) => s.id !== story.id))}
            />
          )}
        </RowList>
      )}

      {dialogMounted ? (
        <StoryDialog
          open={adding}
          onOpenChange={setAdding}
          personId={personId}
          treeId={treeId}
          onTold={(stories) => {
            if (stories) {
              setState({ personId, items: stories, failed: false });
            } else {
              setVersion((v) => v + 1);
            }
          }}
        />
      ) : null}
    </section>
  );
}
