"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  addEntryComment,
  getEntryComments,
  resolveEntryFlag,
} from "@/app/actions/entry-comments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EntryComment } from "@/lib/entry-comments";
import { cn } from "@/lib/utils";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function EntryComments({
  personId,
  currentUserId,
  /** Owner / admin / unclaimed creator — may resolve anyone's flag. */
  canModerate,
}: {
  personId: string;
  currentUserId: string;
  canModerate: boolean;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<{
    personId: string;
    items: EntryComment[] | null;
  }>({ personId, items: null });
  const [body, setBody] = React.useState("");
  const [asFlag, setAsFlag] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  // Comments for the person currently being viewed; `null` while (re)loading.
  const items = state.personId === personId ? state.items : null;
  const setItems = React.useCallback(
    (next: React.SetStateAction<EntryComment[] | null>) =>
      setState((cur) => ({
        personId,
        items: typeof next === "function" ? next(cur.items) : next,
      })),
    [personId],
  );

  React.useEffect(() => {
    let active = true;
    getEntryComments(personId).then((rows) => {
      if (active) setState({ personId, items: rows });
    });
    return () => {
      active = false;
    };
  }, [personId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    const res = await addEntryComment({ personId, body: text, isFlag: asFlag });
    setBusy(false);
    if (res.error || !res.comment) {
      toast.error(res.error ?? "Couldn't post that.");
      return;
    }
    setItems((cur) => [res.comment as EntryComment, ...(cur ?? [])]);
    setBody("");
    setAsFlag(false);
    toast.success(asFlag ? "Flag raised." : "Comment posted.");
    router.refresh();
  }

  async function onToggleFlag(comment: EntryComment) {
    const next = comment.status !== "resolved";
    setPendingId(comment.id);
    // optimistic
    setItems((cur) =>
      cur?.map((c) =>
        c.id === comment.id
          ? { ...c, status: next ? "resolved" : "open" }
          : c,
      ) ?? null,
    );
    const res = await resolveEntryFlag(comment.id, next);
    setPendingId(null);
    if (res.error) {
      toast.error(res.error);
      setItems((cur) =>
        cur?.map((c) =>
          c.id === comment.id ? { ...c, status: comment.status } : c,
        ) ?? null,
      );
      return;
    }
    router.refresh();
  }

  const openFlags =
    items?.filter((c) => c.isFlag && c.status === "open").length ?? 0;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="comments-heading">
      <div className="flex items-center gap-2">
        <h2 id="comments-heading" className="text-sm font-semibold">
          Comments &amp; flags
        </h2>
        {openFlags > 0 ? (
          <Badge variant="destructive">
            {openFlags} open flag{openFlags === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            asFlag
              ? "What looks wrong with this entry?"
              : "Add a note or ask a question about this entry…"
          }
          rows={3}
          maxLength={2000}
          disabled={busy}
        />
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="size-3.5 accent-destructive"
              checked={asFlag}
              onChange={(e) => setAsFlag(e.target.checked)}
              disabled={busy}
            />
            Raise this as a flag for review
          </label>
          <Button
            type="submit"
            size="sm"
            variant={asFlag ? "destructive" : "default"}
            disabled={busy || !body.trim()}
          >
            {busy ? "Posting…" : asFlag ? "Raise flag" : "Comment"}
          </Button>
        </div>
      </form>

      {items === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No comments yet. Be the first to add context.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((c) => {
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
                  <button
                    type="button"
                    className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                    disabled={pendingId === c.id}
                    onClick={() => onToggleFlag(c)}
                  >
                    {c.status === "open" ? "Mark resolved" : "Reopen flag"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
