"use client";

import * as React from "react";

import {
  addStoryComment,
  deleteStoryComment,
  getStoryComments,
} from "@/app/actions/stories";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import { focusIsLost } from "@/components/use-focus-return";
import { COMMENT_MAX } from "@/lib/limits";
import type { StoryComment } from "@/lib/stories";
import { timeAgo } from "@/lib/time-ago";

/**
 * A story's own comments (Step 88.4), opened under it: oldest first, then a
 * box for another. Any member who can read the story may comment, with no
 * approval; a comment is deleted by whoever wrote it, the story's teller or
 * whoever can edit the entry. Read when it opens; kept here after that.
 */
export function StoryComments({
  storyId,
  canTend,
  onCount,
}: {
  storyId: string;
  /** The viewer told the story or may edit the entry: any comment is theirs to delete. */
  canTend: boolean;
  /** How many there are now, for the story's button. */
  onCount: (count: number) => void;
}) {
  const [items, setItems] = React.useState<StoryComment[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [version, setVersion] = React.useState(0);
  const [body, setBody] = React.useState("");
  const post = useAction({ inline: true });
  const formRef = React.useRef<HTMLFormElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const posted = React.useRef(false);
  const onCountRef = React.useRef(onCount);
  React.useEffect(() => {
    onCountRef.current = onCount;
  });

  React.useEffect(() => {
    let active = true;
    getStoryComments(storyId).then(
      (rows) => {
        if (!active) return;
        setItems(rows);
        setFailed(false);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [storyId, version]);

  // The story's button counts what's here, as it's read, added to and
  // deleted from.
  React.useEffect(() => {
    if (items) onCountRef.current(items.length);
  }, [items]);

  // Posted: back to the box for the next one, once it takes typing again,
  // unless focus has gone somewhere else meanwhile.
  React.useEffect(() => {
    if (!posted.current || post.pending) return;
    posted.current = false;
    if (focusIsLost() || formRef.current?.contains(document.activeElement)) {
      textareaRef.current?.focus();
    }
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    post.run("post", () => addStoryComment({ storyId, body: text }), {
      onSuccess: ({ comments }) => {
        if (comments) setItems(comments);
        else setVersion((v) => v + 1);
        setBody("");
        posted.current = true;
      },
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      {failed ? (
        <p className="text-sm text-muted-foreground">
          Couldn’t load the comments.{" "}
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
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((c) => (
            <li key={c.id} className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {c.mine ? "You" : c.saidBy}
                </span>
                <span>{timeAgo(c.createdAt)}</span>
                {c.mine || canTend ? (
                  // It leaves the list once the server has deleted it, so a
                  // failure leaves it where it was.
                  <ConfirmDialog
                    trigger={
                      <button
                        type="button"
                        className="relative tap-target underline underline-offset-2 hover:text-foreground"
                        aria-label={
                          c.mine
                            ? "Delete your comment"
                            : `Delete the comment from ${c.saidBy}`
                        }
                      >
                        Delete
                      </button>
                    }
                    title="Delete this comment?"
                    description="This cannot be undone."
                    confirmLabel="Delete"
                    pendingLabel="Deleting…"
                    onConfirm={() => deleteStoryComment(c.id)}
                    onSuccess={() =>
                      setItems((cur) => cur?.filter((x) => x.id !== c.id) ?? null)
                    }
                  />
                ) : null}
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-2">
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="Comment"
          placeholder="Add a comment"
          rows={2}
          maxLength={COMMENT_MAX}
          disabled={post.pending}
        />
        <FormError>{post.error}</FormError>
        <PendingButton
          type="submit"
          size="sm"
          className="self-end"
          pending={post.pending}
          pendingLabel="Posting…"
          disabled={!body.trim()}
        >
          Post
        </PendingButton>
      </form>
    </div>
  );
}
