"use client";

import * as React from "react";

import {
  addEntryComment,
  getEntryComments,
  resolveEntryFlag,
} from "@/app/actions/entry-comments";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import { useFocusReturn } from "@/components/use-focus-return";
import type { EntryComment } from "@/lib/entry-comments";
import { COMMENT_MAX } from "@/lib/limits";
import { countOf } from "@/lib/plural";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/utils";

/** What a flag's toggle answers: the flag as the board has it now. */
type FlagToggled = { error?: string; fresh?: EntryComment };

export function EntryComments({
  personId,
  treeId,
  currentUserId,
  /** Owner / admin / unclaimed creator — may resolve anyone's flag. */
  canModerate,
}: {
  personId: string;
  /** The board being read: one per tree (Step 25). */
  treeId: string;
  currentUserId: string;
  canModerate: boolean;
}) {
  const [state, setState] = React.useState<{
    personId: string;
    items: EntryComment[] | null;
  }>({ personId, items: null });
  const [body, setBody] = React.useState("");
  const [asFlag, setAsFlag] = React.useState(false);
  const post = useAction({ inline: true });
  const returnFocus = useFocusReturn();
  const boxRef = React.useRef<HTMLTextAreaElement>(null);

  // Comments for the person currently being viewed; `null` while (re)loading.
  const items = state.personId === personId ? state.items : null;
  // A flag resolved or reopened moves at once, and back by itself if the
  // call fails (Step 70); the count of open flags moves with it.
  const [shown, showStatus] = React.useOptimistic(
    items,
    (list, change: { id: string; status: EntryComment["status"] }) =>
      list?.map((c) =>
        c.id === change.id ? { ...c, status: change.status } : c,
      ) ?? null,
  );

  // An answer that lands once the panel has moved on to somebody else leaves
  // the board it shows now alone.
  const setItemsFor = React.useCallback(
    (
      forPerson: string,
      next: (items: EntryComment[] | null) => EntryComment[] | null,
    ) =>
      setState((cur) =>
        cur.personId === forPerson
          ? { personId: forPerson, items: next(cur.items) }
          : cur,
      ),
    [],
  );

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
      () =>
        addEntryComment({
          treeId,
          personId: forPerson,
          body: text,
          isFlag: asFlag,
        }),
      {
        onSuccess: ({ comment }) => {
          if (comment) {
            setItemsFor(forPerson, (cur) => [comment, ...(cur ?? [])]);
          }
          setBody("");
          setAsFlag(false);
          // Emptied, the box disables its button, and focus goes back to
          // the box for the next one, once it's no longer disabled itself.
          returnFocus(() =>
            boxRef.current?.disabled ? null : boxRef.current,
          );
        },
      },
    );
  }

  // Called in the flag's own toggle's transition, so the flag moves at once.
  // Who resolved it isn't in the answer: the board, read again, has it.
  async function toggleFlag(comment: EntryComment): Promise<FlagToggled> {
    const resolved = comment.status === "open";
    showStatus({ id: comment.id, status: resolved ? "resolved" : "open" });
    const res = await resolveEntryFlag(comment.id, resolved);
    if (res.error) return res;
    const rows = await getEntryComments(treeId, personId);
    return { fresh: rows.find((c) => c.id === comment.id) };
  }

  function onToggled(fresh: EntryComment) {
    setItemsFor(personId, (cur) =>
      cur?.map((c) => (c.id === fresh.id ? fresh : c)) ?? null,
    );
  }

  const openFlags =
    shown?.filter((c) => c.isFlag && c.status === "open").length ?? 0;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="comments-heading">
      <div className="flex items-center gap-2">
        <h2 id="comments-heading" className="text-sm font-semibold">
          Comments &amp; flags
        </h2>
        {openFlags > 0 ? (
          <Badge variant="destructive">
            {countOf(openFlags, "open flag")}
          </Badge>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <Textarea
          ref={boxRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            asFlag
              ? "What looks wrong with this entry?"
              : "Add a note or ask a question about this entry…"
          }
          rows={3}
          maxLength={COMMENT_MAX}
          disabled={post.pending}
        />
        <FormError>{post.error}</FormError>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="size-3.5 accent-destructive"
              checked={asFlag}
              onChange={(e) => setAsFlag(e.target.checked)}
              disabled={post.pending}
            />
            Raise this as a flag for review
          </label>
          <PendingButton
            type="submit"
            size="sm"
            variant={asFlag ? "destructive" : "default"}
            pending={post.pending}
            disabled={!body.trim()}
            pendingLabel="Posting…"
          >
            {asFlag ? "Raise flag" : "Comment"}
          </PendingButton>
        </div>
      </form>

      {shown === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No comments yet. Be the first to add context.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((c) => {
            const canToggle =
              c.isFlag && (canModerate || c.createdBy === currentUserId);
            return (
              <li
                key={c.id}
                className={cn(
                  "flex flex-col gap-1 rounded-md border p-3 text-sm",
                  c.isFlag && c.status === "open"
                    ? "border-destructive/50 bg-destructive/5"
                    : "border-border",
                )}
              >
                <div className="flex items-center gap-2">
                  {c.isFlag ? (
                    <Badge
                      variant={
                        c.status === "open" ? "destructive" : "secondary"
                      }
                    >
                      {c.status === "open" ? "Flag" : "Flag · resolved"}
                    </Badge>
                  ) : null}
                  <span className="font-medium">{c.authorName}</span>
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(c.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-foreground">{c.body}</p>
                {c.isFlag && c.status === "resolved" && c.resolverName ? (
                  <p className="text-xs text-muted-foreground">
                    Resolved by {c.resolverName}
                  </p>
                ) : null}
                {canToggle ? (
                  <FlagToggle
                    comment={c}
                    toggle={toggleFlag}
                    onToggled={onToggled}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * "Mark resolved" / "Reopen flag", with a handle of its own, so a flag on its
 * way leaves the others free (Step 70).
 */
function FlagToggle({
  comment,
  toggle,
  onToggled,
}: {
  comment: EntryComment;
  toggle: (comment: EntryComment) => Promise<FlagToggled>;
  onToggled: (fresh: EntryComment) => void;
}) {
  const action = useAction();
  return (
    <button
      type="button"
      className="relative tap-target self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground aria-disabled:opacity-50"
      // Not `disabled`, which would drop keyboard focus while it runs.
      aria-disabled={action.pending || undefined}
      onClick={() => {
        if (action.pending) return;
        action.run("flag", () => toggle(comment), {
          onSuccess: ({ fresh }) => {
            if (fresh) onToggled(fresh);
          },
        });
      }}
    >
      {comment.status === "open" ? "Mark resolved" : "Reopen flag"}
    </button>
  );
}
