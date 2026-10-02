"use client";

import * as React from "react";

import {
  addPetComment,
  deletePetComment,
  getPetComments,
} from "@/app/actions/pet-comments";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { RowCard, RowList } from "@/components/row-card";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import { focusIsLost } from "@/components/use-focus-return";
import { COMMENT_MAX } from "@/lib/limits";
import type { PetComment } from "@/lib/pet-comments";
import { timeAgo } from "@/lib/time-ago";

/**
 * A companion's comment thread. Plain notes only — no flags — because a pet
 * is a warm footnote, not a record to police.
 */
export function PetComments({
  petId,
  currentUserId,
  /** Whoever can edit the companion may also tidy anyone's comment. */
  canEdit,
}: {
  petId: string;
  currentUserId: string;
  canEdit: boolean;
}) {
  const [state, setState] = React.useState<{
    petId: string;
    items: PetComment[] | null;
  }>({ petId, items: null });
  const [body, setBody] = React.useState("");
  const post = useAction({ inline: true });
  const formRef = React.useRef<HTMLFormElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const posted = React.useRef(false);

  const items = state.petId === petId ? state.items : null;
  const setItems = React.useCallback(
    (next: React.SetStateAction<PetComment[] | null>) =>
      setState((cur) =>
        // A late answer for a companion the sheet has since moved on from
        // leaves the one it shows now alone.
        cur.petId !== petId
          ? cur
          : {
              petId,
              items: typeof next === "function" ? next(cur.items) : next,
            },
      ),
    [petId],
  );

  // Another companion opened: a failure to post on the last one isn't
  // this one's.
  const [shownPetId, setShownPetId] = React.useState(petId);
  if (shownPetId !== petId) {
    setShownPetId(petId);
    post.setError(null);
  }

  React.useEffect(() => {
    let active = true;
    getPetComments(petId).then((rows) => {
      if (active) setState({ petId, items: rows });
    });
    return () => {
      active = false;
    };
  }, [petId]);

  // Posted: back to the box for the next one (Step 70), once it takes typing
  // again, unless focus has gone somewhere else meanwhile.
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
    post.run("post", () => addPetComment({ petId, body: text }), {
      onSuccess: ({ comment }) => {
        if (comment) setItems((cur) => [comment, ...(cur ?? [])]);
        setBody("");
        posted.current = true;
      },
    });
  }

  return (
    <section
      className="flex flex-col gap-3 border-t border-border pt-5"
      aria-labelledby="pet-comments-heading"
    >
      <h2 id="pet-comments-heading" className="text-sm font-semibold">
        Comments
      </h2>

      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-2">
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share a memory or a detail about this companion…"
          rows={3}
          maxLength={COMMENT_MAX}
          disabled={post.pending}
        />
        <FormError>{post.error}</FormError>
        <PendingButton
          type="submit"
          size="sm"
          className="self-end"
          pending={post.pending}
          pendingLabel="posting…"
          disabled={!body.trim()}
        >
          comment
        </PendingButton>
      </form>

      {items === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <RowList
          items={items}
          empty="No comments yet. Be the first to add a memory."
          dense
        >
          {(c) => {
            const canRemove = canEdit || c.createdBy === currentUserId;
            return (
              <RowCard key={c.id} className="gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.authorName}</span>
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(c.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-foreground">{c.body}</p>
                {canRemove ? (
                  // It leaves the list once the server has deleted it, so a
                  // failure leaves it where it was.
                  <ConfirmDialog
                    trigger={
                      <button
                        type="button"
                        className="relative tap-target self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        aria-label={
                          c.createdBy === currentUserId
                            ? "Delete your comment"
                            : `Delete the comment from ${c.authorName}`
                        }
                      >
                        delete
                      </button>
                    }
                    title="Delete this comment?"
                    description="This cannot be undone."
                    confirmLabel="delete"
                    pendingLabel="deleting…"
                    onConfirm={() => deletePetComment(c.id)}
                    onSuccess={() =>
                      setItems(
                        (cur) => cur?.filter((x) => x.id !== c.id) ?? null,
                      )
                    }
                  />
                ) : null}
              </RowCard>
            );
          }}
        </RowList>
      )}
    </section>
  );
}
