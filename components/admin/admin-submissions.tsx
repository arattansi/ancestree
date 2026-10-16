"use client";

import * as React from "react";

import {
  closeLibrarySubmission,
  deleteLibrarySubmission,
  draftLibrarySubmission,
  resolveLibraryChange,
} from "@/app/actions/library-submissions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PendingButton } from "@/components/pending-button";
import { RowCard, RowList } from "@/components/row-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { BLOG_KIND_LABEL, blogPostHref } from "@/lib/blog";
import {
  hasChangeWaiting,
  peopleNames,
  type ChangeRequest,
  type LibrarySubmission,
} from "@/lib/library-submissions";
import { shortDate } from "@/lib/short-date";

/**
 * Stories sent in from /library/submit (Step 157), on the blog tab above
 * the posts: what's waiting first (a new story, or a change its sender
 * asked for from their copy), each to read in full with its photo, made a
 * draft (opened below to edit, its photo the cover), set aside, or
 * deleted; a change asked for is marked done once seen to. The sender is
 * answered by email, from their address here.
 */
export function AdminSubmissions({
  submissions,
  onOpenPost,
}: {
  submissions: LibrarySubmission[];
  /** Opens a post's editor in the list below. */
  onOpenPost: (postId: string) => void;
}) {
  return (
    <RowList items={submissions} empty="Nothing sent in yet.">
      {(s) => <SubmissionRow key={s.id} submission={s} onOpenPost={onOpenPost} />}
    </RowList>
  );
}

const STATUS_LABEL = { new: "New", drafted: "Drafted", closed: "Set aside" } as const;

function SubmissionRow({
  submission: s,
  onOpenPost,
}: {
  submission: LibrarySubmission;
  onOpenPost: (postId: string) => void;
}) {
  const action = useAction();
  const [reading, setReading] = React.useState(false);
  const who = peopleNames(s.people);
  const waiting = hasChangeWaiting(s.changeRequests);

  return (
    <RowCard>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 font-medium">
            <span className="break-words">{s.title}</span>
            <Badge variant={s.status === "new" ? "default" : "secondary"}>
              {s.status === "drafted" && !s.post ? "Draft deleted" : STATUS_LABEL[s.status]}
            </Badge>
            {waiting ? <Badge variant="outline">Change asked for</Badge> : null}
          </p>
          <p className="text-muted-foreground">
            {BLOG_KIND_LABEL[s.kind]}
            {who ? `: ${who}` : ""}
            {s.photoUrl ? " · photo" : " · no photo"}
          </p>
          <p className="break-words text-muted-foreground">
            From{" "}
            <a
              href={`mailto:${s.email}`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              {s.email}
            </a>
            {` · Sent ${shortDate(s.createdAt)}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReading((r) => !r)}
          aria-expanded={reading}
          className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {reading ? "Hide" : "Read it"}
        </button>
      </div>

      {reading ? (
        <div className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
          {s.photoUrl ? (
            <a href={s.photoUrl} target="_blank" rel="noopener noreferrer" className="self-start">
              {/* A signed address for an hour, not for next/image to cache. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.photoUrl} alt="" className="max-h-60 rounded-md border object-cover" />
            </a>
          ) : null}
          <p className="whitespace-pre-wrap break-words text-muted-foreground">{s.body}</p>
        </div>
      ) : null}

      {s.changeRequests.length ? (
        <ul className="flex flex-col gap-2">
          {s.changeRequests.map((r) => (
            <ChangeRow key={r.id} request={r} />
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {s.post ? (
          <>
            <Button type="button" size="sm" onClick={() => onOpenPost(s.post!.id)}>
              edit the draft
            </Button>
            <a
              href={blogPostHref(s.post.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {s.post.publishedAt ? "View" : "Preview"}
            </a>
          </>
        ) : (
          <>
            <PendingButton
              type="button"
              size="sm"
              pending={action.pendingKey === "draft"}
              disabled={action.pending}
              pendingLabel="making a draft…"
              onClick={() =>
                action.run("draft", () => draftLibrarySubmission(s.id), {
                  onSuccess: (result) => {
                    if ("id" in result) onOpenPost(result.id);
                  },
                })
              }
            >
              make a draft
            </PendingButton>
            <PendingButton
              type="button"
              size="sm"
              variant="outline"
              pending={action.pendingKey === "close"}
              disabled={action.pending}
              pendingLabel={s.status === "closed" ? "putting back…" : "setting aside…"}
              onClick={() =>
                action.run("close", () => closeLibrarySubmission(s.id, s.status !== "closed"))
              }
            >
              {s.status === "closed" ? "put back" : "set aside"}
            </PendingButton>
          </>
        )}
        <ConfirmDialog
          trigger={
            <Button type="button" size="sm" variant="outline" disabled={action.pending}>
              delete
            </Button>
          }
          title={`Delete “${s.title}”?`}
          description="This cannot be undone."
          confirmLabel="delete"
          pendingLabel="deleting…"
          onConfirm={() => deleteLibrarySubmission(s.id)}
        />
      </div>
    </RowCard>
  );
}

/** A change its sender asked for, marked done once a reviewer has seen to it. */
function ChangeRow({ request: r }: { request: ChangeRequest }) {
  const action = useAction();
  const done = r.resolvedAt !== null;
  return (
    <li className="flex flex-col gap-1.5 rounded-md border border-dashed p-2.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="whitespace-pre-wrap break-words">{r.message}</p>
        <p className="text-xs text-muted-foreground">
          Change asked for {shortDate(r.createdAt)}
          {done ? ` · done ${shortDate(r.resolvedAt!)}` : ""}
        </p>
      </div>
      <PendingButton
        type="button"
        size="sm"
        variant={done ? "ghost" : "outline"}
        className="self-start"
        pending={action.pending}
        pendingLabel="saving…"
        onClick={() => action.run("resolve", () => resolveLibraryChange(r.id, !done))}
      >
        {done ? "not done" : "done"}
      </PendingButton>
    </li>
  );
}
