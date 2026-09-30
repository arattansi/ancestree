"use client";

import * as React from "react";

import { addEntryComment, getEntryComments } from "@/app/actions/entry-comments";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { RowCard, RowList } from "@/components/row-card";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import { useFocusReturn } from "@/components/use-focus-return";
import type { EntryComment } from "@/lib/entry-comments";
import { COMMENT_MAX } from "@/lib/limits";
import { timeAgo } from "@/lib/time-ago";

/**
 * The entry's comments on this tree. A problem with the entry is reported
 * from the flag in its header instead, and only whoever can put it right
 * sees it (Step 88.2).
 */
export function EntryComments({
  personId,
  treeId,
}: {
  personId: string;
  /** The board being read: one per tree (Step 25). */
  treeId: string;
}) {
  const [state, setState] = React.useState<{
    personId: string;
    items: EntryComment[] | null;
  }>({ personId, items: null });
  const [body, setBody] = React.useState("");
  const post = useAction({ inline: true });
  const returnFocus = useFocusReturn();
  const boxRef = React.useRef<HTMLTextAreaElement>(null);

  // Comments for the person currently being viewed; `null` while (re)loading.
  const items = state.personId === personId ? state.items : null;

  React.useEffect(() => {
    let active = true;
    getEntryComments(treeId, personId).then((rows) => {
      if (active) setState({ personId, items: rows });
    });
    return () => {
      active = false;
    };
  }, [treeId, personId]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    const forPerson = personId;
    post.run(
      "post",
      () => addEntryComment({ treeId, personId: forPerson, body: text }),
      {
        onSuccess: ({ comment }) => {
          // An answer that lands once the panel has moved on to somebody
          // else leaves the board it shows now alone.
          if (comment) {
            setState((cur) =>
              cur.personId === forPerson
                ? { personId: forPerson, items: [comment, ...(cur.items ?? [])] }
                : cur,
            );
          }
          setBody("");
          // Emptied, the box disables its button, and focus goes back to
          // the box for the next one, once it's no longer disabled itself.
          returnFocus(() =>
            boxRef.current?.disabled ? null : boxRef.current,
          );
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="text-sm font-semibold">
        Comments
      </h2>

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <Textarea
          ref={boxRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note or ask a question about this entry…"
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
          disabled={!body.trim()}
          pendingLabel="Posting…"
        >
          Comment
        </PendingButton>
      </form>

      {items === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <RowList
          items={items}
          empty="No comments yet. Be the first to add context."
          dense
        >
          {(c) => (
            <RowCard key={c.id} className="gap-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{c.authorName}</span>
                <span className="text-xs text-muted-foreground">
                  {timeAgo(c.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-foreground">{c.body}</p>
            </RowCard>
          )}
        </RowList>
      )}
    </section>
  );
}
