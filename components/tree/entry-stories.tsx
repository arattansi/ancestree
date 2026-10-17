"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Globe, MessageCircle, Mic, Pencil, Plus, Share } from "lucide-react";

import {
  decideStory,
  deleteStory,
  removeStoryPerson,
  shareStory,
  stopSharingStory,
} from "@/app/actions/stories";
import { ActionButton } from "@/components/action-button";
import { ConfirmButton } from "@/components/confirm-dialog";
import { PendingButton } from "@/components/pending-button";
import { RowCard, RowList } from "@/components/row-card";
import { sendLink } from "@/components/send-link";
import type { CompanionOption } from "@/components/tree/companion-picker";
import { StoryCreditTag } from "@/components/story-credit-tag";
import { StoryCreditTags, creditTagClass } from "@/components/story-credit-tags";
import { StoryComments } from "@/components/tree/story-comments";
import { StoryText } from "@/components/tree/story-text";
import {
  invalidatePersonSheet,
  setPersonSheet,
  usePersonSheet,
} from "@/components/tree/use-person-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import type { EntryStory } from "@/lib/stories";
import { nameList } from "@/lib/story-about";
import { formatDuration } from "@/lib/story-audio";
import { relationText, type Relation } from "@/lib/connection-path";
import { toldLabel } from "@/lib/story-credits";
import { isLongStory } from "@/lib/story-text";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/utils";

// Opened by a press, so it and what it loads wait for one (Step 87.4).
const StoryDialog = dynamic(
  () => import("@/components/tree/story-dialog").then((m) => m.StoryDialog),
  { ssr: false },
);
const StoryEditDialog = dynamic(
  () => import("@/components/tree/story-edit-dialog").then((m) => m.StoryEditDialog),
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
      pendingLabel="sharing…"
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
      share
    </PendingButton>
  );
}

/**
 * One story (Step 88.3), as this person's own: its title, who added it and
 * when, when it was told, who it's credited to as storyteller and
 * interviewer, and, when it's about others too, everyone it's about (Step
 * 183), each a tag that opens a card saying what they are to this person
 * ("Great-grandson of Amarshi Sayani"), if anything joins them (Step 99);
 * then the text (Markdown, folded when it's long) and the recording.
 * Whoever answers for this person approves it here, or takes it off their
 * details while it's on others'; its teller, or whoever can edit everyone
 * it's about, may delete it. An approved one has its own comments, and may
 * be shared by a public link (Step 88.4).
 */
function StoryCard({
  story,
  personId,
  personName,
  describeConnection,
  onEditCredits,
  canTend,
  focused,
  onDecided,
  onDeleted,
  onChanged,
}: {
  story: EntryStory;
  /** Whose sheet it's on: their own tag opens nothing. */
  personId: string;
  personName: string;
  /** What one person is to another on this canvas (Step 99). */
  describeConnection?: (fromId: string, toId: string) => Relation | null;
  /** Opens it to edit (Steps 99.5–99.7): its words for its teller, its
   *  credits and date for them and whoever else may. */
  onEditCredits: () => void;
  /** Any comment on it is theirs to delete. */
  canTend: boolean;
  /** A link to its comments opened the sheet. */
  focused: boolean;
  /** This person's answer given. */
  onDecided: (approved: boolean) => void;
  /** Off this person's details: deleted, or taken off. */
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
  // Folded, whether anything is hidden: Markdown's blocks are measured,
  // once drawn, rather than guessed from its characters and lines.
  const clipRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = React.useState(true);
  React.useEffect(() => {
    const clip = clipRef.current;
    const inner = innerRef.current;
    if (!long || expanded || !clip || !inner) return;
    const check = () => setOverflows(inner.offsetHeight > clip.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [long, expanded]);
  const folds = long && overflows;
  const approved = story.status === "approved";
  const told = toldLabel(story.toldOn, story.toldPrecision);
  // Everyone else it's about, whose details it stays on if it leaves these.
  const others = story.about.filter((p) => p.id !== personId);
  return (
    <RowCard ref={cardRef} className="gap-2">
      {story.title ? <p className="font-medium">{story.title}</p> : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>
          Added by{" "}
          <span className="font-medium text-foreground">
            {story.mine ? "you" : story.toldBy}
          </span>
        </span>
        <span>{timeAgo(story.createdAt)}</span>
        {told ? <span>{told}</span> : null}
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
      <StoryCreditTags
        credits={story.credits}
        className="text-xs text-muted-foreground"
        tag={(p) => {
          const relation = describeConnection?.(p.id, personId);
          return (
            <StoryCreditTag
              name={p.name}
              relation={relation ? relationText(relation, personName) : null}
            />
          );
        }}
      />
      {others.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>About</span>
          {story.about.map((p) => {
            if (p.id === personId) {
              return (
                <span key={p.id} className={creditTagClass}>
                  {p.name}
                </span>
              );
            }
            if (p.status !== "approved") {
              return (
                <span key={p.id} className={creditTagClass}>
                  {p.name} ({p.status === "pending" ? "waiting" : "not approved"})
                </span>
              );
            }
            const relation = describeConnection?.(p.id, personId);
            return (
              <span key={p.id} className="contents">
                <StoryCreditTag
                  name={p.name}
                  relation={relation ? relationText(relation, personName) : null}
                />
              </span>
            );
          })}
        </div>
      ) : null}
      {story.body ? (
        <div className="flex flex-col items-start gap-1">
          {/* Folded by height, not lines: Markdown is blocks, not one run of text. */}
          <div
            ref={clipRef}
            className={
              long && !expanded
                ? cn(
                    "relative max-h-36 w-full overflow-hidden",
                    folds &&
                      "after:absolute after:inset-x-0 after:bottom-0 after:h-10 after:bg-gradient-to-t after:from-popover after:to-transparent",
                  )
                : "w-full"
            }
          >
            <div ref={innerRef}>
              <StoryText>{story.body}</StoryText>
            </div>
          </div>
          {folds ? (
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
        {/* Not shared from details it's still waiting to be on. */}
        {approved && story.canShare ? (
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
              confirmLabel: "stop sharing",
              pendingLabel: "stopping…",
              destructive: false,
              onConfirm: () => stopSharingStory(story.id),
              onSuccess: () => onChanged({ shared: false, shareUrl: null }),
            }}
          >
            stop sharing
          </ConfirmButton>
        ) : null}
        {story.canDecide ? (
          <>
            <ActionButton
              size="sm"
              action={() => decideStory(story.id, personId, true)}
              pendingLabel="approving…"
              onSuccess={() => onDecided(true)}
            >
              approve
            </ActionButton>
            <ActionButton
              size="sm"
              variant="outline"
              action={() => decideStory(story.id, personId, false)}
              pendingLabel="declining…"
              removesRow={!story.mine}
              onSuccess={() => onDecided(false)}
            >
              decline
            </ActionButton>
          </>
        ) : null}
        {story.canEditCredits ? (
          <Button type="button" size="sm" variant="ghost" onClick={onEditCredits}>
            <Pencil aria-hidden />
            {story.mine ? "edit" : "credits and date"}
          </Button>
        ) : null}
        {story.canRemove && !story.canDecide ? (
          <ConfirmButton
            size="sm"
            variant="ghost"
            confirm={{
              title: `Take this story off ${personName}’s details?`,
              description:
                others.length === 1
                  ? `It stays on ${others[0].name}’s.`
                  : `It stays on the details of ${nameList(others.map((p) => p.name))}.`,
              confirmLabel: "remove",
              pendingLabel: "removing…",
              destructive: false,
              onConfirm: () => removeStoryPerson(story.id, personId),
              onSuccess: onDeleted,
            }}
          >
            remove
          </ConfirmButton>
        ) : null}
        {story.canDelete ? (
          <ConfirmButton
            size="sm"
            variant="ghost"
            className="text-destructive"
            confirm={{
              title: "Delete this story?",
              description: "This cannot be undone.",
              confirmLabel: "delete",
              pendingLabel: "deleting…",
              onConfirm: () => deleteStory(story.id),
              onSuccess: onDeleted,
            }}
          >
            delete
          </ConfirmButton>
        ) : null}
      </div>
      {approved && commentsOpen ? (
        <StoryComments
          storyId={story.id}
          canTend={canTend}
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
  people,
  personName,
  describeConnection,
}: {
  personId: string;
  /** The tree they're read on, which a new one is told on. */
  treeId: string;
  /** The viewer may edit the entry, so may delete any comment on its stories. */
  canEdit: boolean;
  /** Everyone on the canvas, who a story may credit (Step 99). */
  people: CompanionOption[];
  /** Who they are, for a credit's card (Step 99). */
  personName: string;
  /** What one person is to another on this canvas: a credit's card (Step 99). */
  describeConnection?: (fromId: string, toId: string) => Relation | null;
}) {
  // Read with the rest of the sheet when it opens (Step 87.6).
  const sheet = usePersonSheet(personId);
  const [adding, setAdding] = React.useState(false);
  // Mounted from the first press on, so it can close with its animation.
  const [dialogMounted, setDialogMounted] = React.useState(false);
  // The story being edited (Steps 99.5–99.7).
  const [crediting, setCrediting] = React.useState<EntryStory | null>(null);
  const [creditsMounted, setCreditsMounted] = React.useState(false);

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
    setCrediting(null);
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
          add
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
              personId={personId}
              personName={personName}
              describeConnection={describeConnection}
              onEditCredits={() => {
                setCreditsMounted(true);
                setCrediting(story);
              }}
              canTend={story.canDelete || canEdit}
              focused={focusFound && story.id === focusStory}
              onDecided={(approved) => {
                const status = approved ? "approved" : "declined";
                update((all) =>
                  approved || story.mine
                    ? all.map((s) =>
                        s.id === story.id
                          ? {
                              ...s,
                              status,
                              canDecide: false,
                              about: s.about.map((p) =>
                                p.id === personId ? { ...p, status } : p,
                              ),
                            }
                          : s,
                      )
                    : // Declined, it's off this person's details, but for its teller.
                      all.filter((s) => s.id !== story.id),
                );
                // It shows, or doesn't, on everyone else's as well.
                for (const p of story.about) {
                  if (p.id !== personId) invalidatePersonSheet(p.id, ["stories"]);
                }
              }}
              onDeleted={() => {
                update((all) => all.filter((s) => s.id !== story.id));
                for (const p of story.about) {
                  if (p.id !== personId) invalidatePersonSheet(p.id, ["stories"]);
                }
              }}
              onChanged={(change) =>
                update((all) =>
                  all.map((s) => (s.id === story.id ? { ...s, ...change } : s)),
                )
              }
            />
          )}
        </RowList>
      )}

      {creditsMounted ? (
        <StoryEditDialog
          story={crediting}
          onClose={() => setCrediting(null)}
          personId={personId}
          treeId={treeId}
          people={people}
          onSaved={(stories, about) => {
            if (stories) {
              setPersonSheet(personId, "stories", () => stories);
            } else {
              invalidatePersonSheet(personId, ["stories"]);
            }
            for (const id of about) {
              if (id !== personId) invalidatePersonSheet(id, ["stories"]);
            }
          }}
        />
      ) : null}

      {dialogMounted ? (
        <StoryDialog
          open={adding}
          onOpenChange={setAdding}
          personId={personId}
          treeId={treeId}
          people={people}
          onTold={(stories, first, about) => {
            if (stories && first === personId) {
              setPersonSheet(personId, "stories", () => stories);
            } else if (about.includes(personId)) {
              invalidatePersonSheet(personId, ["stories"]);
            }
            // Everyone else it's about has it too, once read again.
            for (const id of about) {
              if (id !== personId) invalidatePersonSheet(id, ["stories"]);
            }
          }}
        />
      ) : null}
    </section>
  );
}
