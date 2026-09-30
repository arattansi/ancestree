"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Globe, MessageCircle, Mic, Plus, Share } from "lucide-react";

import {
  decideStory,
  deleteStory,
  shareStory,
  stopSharingStory,
} from "@/app/actions/stories";
import { ActionButton } from "@/components/action-button";
import { ConfirmButton } from "@/components/confirm-dialog";
import { PendingButton } from "@/components/pending-button";
import { RowCard, RowList } from "@/components/row-card";
import { sendLink } from "@/components/send-link";
import { StoryComments } from "@/components/tree/story-comments";
import {
  invalidatePersonSheet,
  setPersonSheet,
  usePersonSheet,
} from "@/components/tree/use-person-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import type { EntryStory } from "@/lib/stories";
import { formatDuration } from "@/lib/story-audio";
import { isLongStory } from "@/lib/story-text";
import { timeAgo } from "@/lib/time-ago";

// Opened by a press, so it and what it loads wait for one (Step 87.4).
const StoryDialog = dynamic(
  () => import("@/components/tree/story-dialog").then((m) => m.StoryDialog),
  { ssr: false },
);

/** "Comment", or how many there are. */
function commentsLabel(count: number): string {
  if (count === 0) return "Comment";
  return count === 1 ? "1 comment" : `${count} comments`;
}

/**
 * Share an approved story (Step 88.4): the viewer's own public link, made
 * the first time, then sent (`sendLink`).
 */
function ShareButton({
  story,
  onShared,
}: {
  story: EntryStory;
  onShared: (url: string) => void;
}) {
  const share = useAction();
  const title = story.title ?? undefined;
  return (
    <PendingButton
      type="button"
      size="sm"
      variant="ghost"
      pending={share.pending}
      pendingLabel="Sharing…"
      onClick={() => {
        if (story.shareUrl) {
          void sendLink(story.shareUrl, title);
          return;
        }
        share.run("share", () => shareStory(story.id), {
          onSuccess: ({ url }) => {
            if (!url) return;
            onShared(url);
            void sendLink(url, title);
          },
        });
      }}
    >
      <Share aria-hidden />
      Share
    </PendingButton>
  );
}

/**
 * One story (Step 88.3): its title, who told it and when, the text (folded
 * when it's long) and the recording. Whoever may approve a waiting story
 * answers it here; its teller, or whoever can edit the entry, may delete it.
 * An approved one has its own comments, and may be shared by a public link
 * (Step 88.4).
 */
function StoryCard({
  story,
  canDelete,
  focused,
  onDecided,
  onDeleted,
  onChanged,
}: {
  story: EntryStory;
  /** Theirs to delete, and so is any comment on it. */
  canDelete: boolean;
  /** A link to its comments opened the sheet. */
  focused: boolean;
  onDecided: (approved: boolean) => void;
  onDeleted: () => void;
  onChanged: (change: Partial<EntryStory>) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [commentsOpen, setCommentsOpen] = React.useState(focused);
  const cardRef = React.useRef<HTMLLIElement>(null);
  // Sent here to read its comments: they open, and it comes into view.
  const [wasFocused, setWasFocused] = React.useState(focused);
  if (focused !== wasFocused) {
    setWasFocused(focused);
    if (focused) setCommentsOpen(true);
  }
  React.useEffect(() => {
    if (focused) cardRef.current?.scrollIntoView({ block: "start" });
  }, [focused]);
  const long = story.body ? isLongStory(story.body) : false;
  const approved = story.status === "approved";
  return (
    <RowCard ref={cardRef} className="gap-2">
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
        {story.shared ? (
          <Badge variant="outline">
            <Globe aria-hidden />
            Shared
          </Badge>
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
        {approved ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={commentsOpen}
            onClick={() => setCommentsOpen((open) => !open)}
          >
            <MessageCircle aria-hidden />
            {commentsLabel(story.commentCount)}
          </Button>
        ) : null}
        {story.canShare ? (
          <ShareButton
            story={story}
            onShared={(url) => onChanged({ shared: true, shareUrl: url })}
          />
        ) : null}
        {story.shared && story.canStopSharing ? (
          <ConfirmButton
            size="sm"
            variant="ghost"
            confirm={{
              title: "Stop sharing this story?",
              description: "Its links stop working.",
              confirmLabel: "Stop sharing",
              pendingLabel: "Stopping…",
              destructive: false,
              onConfirm: () => stopSharingStory(story.id),
              onSuccess: () => onChanged({ shared: false, shareUrl: null }),
            }}
          >
            Stop sharing
          </ConfirmButton>
        ) : null}
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
      {approved && commentsOpen ? (
        <StoryComments
          storyId={story.id}
          canTend={canDelete}
          onCount={(count) => {
            if (count !== story.commentCount) onChanged({ commentCount: count });
          }}
        />
      ) : null}
    </RowCard>
  );
}

/**
 * The stories about someone (Step 88.3), in place of the comments board
 * they replaced: those the viewer may see, newest first, and a way to add
 * one. Read when the entry opens (`useLoadPersonSheet`); told, answered and
 * deleted here, so the list keeps itself without the page being drawn
 * again.
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
  // Read with the rest of the sheet when it opens (Step 87.6).
  const sheet = usePersonSheet(personId);
  const [adding, setAdding] = React.useState(false);
  // Mounted from the first press on, so it can close with its animation.
  const [dialogMounted, setDialogMounted] = React.useState(false);

  // The stories of the person being viewed; `null` while loading.
  const items = sheet?.sheet.stories ?? null;
  const failed = items === null && !!sheet?.failed.includes("stories");

  // A story whose comments the address asks for (`treeStoryHref`, Step
  // 88.4): opened once it's here, then gone from the address, so a reload
  // or coming back to this person doesn't open it again.
  const focusStory = useSearchParams().get("story");
  const focusFound = !!focusStory && !!items?.some((s) => s.id === focusStory);
  React.useEffect(() => {
    if (!focusFound) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("story");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [focusFound]);

  // Another person, and what was being written for the last one goes.
  const [prevPerson, setPrevPerson] = React.useState(personId);
  if (personId !== prevPerson) {
    setPrevPerson(personId);
    setAdding(false);
  }

  function update(change: (items: EntryStory[]) => EntryStory[]) {
    setPersonSheet(personId, "stories", (all) => all && change(all));
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

      {failed ? (
        <p className="text-sm text-muted-foreground">
          Couldn’t load the stories.{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => invalidatePersonSheet(personId, ["stories"])}
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
              focused={focusFound && story.id === focusStory}
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
              onChanged={(change) =>
                update((all) =>
                  all.map((s) => (s.id === story.id ? { ...s, ...change } : s)),
                )
              }
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
              setPersonSheet(personId, "stories", () => stories);
            } else {
              invalidatePersonSheet(personId, ["stories"]);
            }
          }}
        />
      ) : null}
    </section>
  );
}
