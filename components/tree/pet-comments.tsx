"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  addPetComment,
  deletePetComment,
  getPetComments,
} from "@/app/actions/pet-comments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PetComment } from "@/lib/pet-comments";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * A companion's comment thread. Plain notes only — no flags, no verification —
 * because a pet is a warm footnote, not a record to police.
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
  const router = useRouter();
  const [state, setState] = React.useState<{
    petId: string;
    items: PetComment[] | null;
  }>({ petId, items: null });
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const items = state.petId === petId ? state.items : null;
  const setItems = React.useCallback(
    (next: React.SetStateAction<PetComment[] | null>) =>
      setState((cur) => ({
        petId,
        items: typeof next === "function" ? next(cur.items) : next,
      })),
    [petId],
  );

  React.useEffect(() => {
    let active = true;
    getPetComments(petId).then((rows) => {
      if (active) setState({ petId, items: rows });
    });
    return () => {
      active = false;
    };
  }, [petId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    const res = await addPetComment({ petId, body: text });
    setBusy(false);
    if (res.error || !res.comment) {
      toast.error(res.error ?? "Couldn't post that.");
      return;
    }
    setItems((cur) => [res.comment as PetComment, ...(cur ?? [])]);
    setBody("");
    toast.success("Comment posted.");
    router.refresh();
  }

  async function onDelete(comment: PetComment) {
    setPendingId(comment.id);
    setItems((cur) => cur?.filter((c) => c.id !== comment.id) ?? null);
    const res = await deletePetComment(comment.id);
    setPendingId(null);
    if (res.error) {
      toast.error(res.error);
      setItems((cur) => [comment, ...(cur ?? [])]);
      return;
    }
    router.refresh();
  }

  return (
    <section
      className="flex flex-col gap-3 border-t border-border pt-5"
      aria-labelledby="pet-comments-heading"
    >
      <h2 id="pet-comments-heading" className="text-sm font-semibold">
        Comments
      </h2>

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share a memory or a detail about this companion…"
          rows={3}
          maxLength={2000}
          disabled={busy}
        />
        <Button
          type="submit"
          size="sm"
          className="self-end"
          disabled={busy || !body.trim()}
        >
          {busy ? "Posting…" : "Comment"}
        </Button>
      </form>

      {items === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No comments yet. Be the first to add a memory.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((c) => {
            const canRemove = canEdit || c.createdBy === currentUserId;
            return (
              <li
                key={c.id}
                className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.authorName}</span>
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(c.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-foreground">{c.body}</p>
                {canRemove ? (
                  <button
                    type="button"
                    className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                    disabled={pendingId === c.id}
                    onClick={() => onDelete(c)}
                  >
                    Delete
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
