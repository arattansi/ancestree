"use client";

import * as React from "react";

import {
  createBlogPost,
  deleteBlogPost,
  setBlogPostPublished,
  updateBlogPost,
} from "@/app/actions/blog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { RowCard, RowList } from "@/components/row-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import { blogPostHref, type BlogPost } from "@/lib/blog";
import { BLOG_BODY_MAX, BLOG_TITLE_MAX } from "@/lib/limits";
import { shortDate } from "@/lib/short-date";

/**
 * The blog on the admin page's blog tab (Step 134): write a draft in
 * Markdown, then edit it, open it to preview it, publish it (or take it
 * back to a draft), and delete it. Drafts sit first in the list.
 */
export function AdminBlog({ posts }: { posts: BlogPost[] }) {
  return (
    <div className="flex flex-col gap-5">
      <NewPost />
      <RowList items={posts} empty="No posts yet.">
        {(p) => <PostRow key={p.id} post={p} />}
      </RowList>
    </div>
  );
}

/** A post's title and its Markdown, for a new draft and for editing one. */
function PostFields({
  idPrefix,
  title,
  onTitle,
  body,
  onBody,
  disabled,
  autoFocus = false,
}: {
  idPrefix: string;
  title: string;
  onTitle: (title: string) => void;
  body: string;
  onBody: (body: string) => void;
  disabled: boolean;
  autoFocus?: boolean;
}) {
  const over = body.trim().length - BLOG_BODY_MAX;
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-title`}>Title</Label>
        <Input
          id={`${idPrefix}-title`}
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          maxLength={BLOG_TITLE_MAX}
          disabled={disabled}
          autoComplete="off"
          autoFocus={autoFocus}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-body`}>Post (Markdown)</Label>
        <Textarea
          id={`${idPrefix}-body`}
          value={body}
          onChange={(e) => onBody(e.target.value)}
          rows={12}
          disabled={disabled}
          aria-invalid={over > 0}
          className="max-h-[60dvh] font-mono text-xs"
        />
        <FormError>
          {over > 0 ? `Too long by ${over.toLocaleString("en")} characters.` : null}
        </FormError>
      </div>
    </>
  );
}

function NewPost() {
  const action = useAction({ inline: true });
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    action.run("save", () => createBlogPost(title, body), {
      onSuccess: () => {
        setTitle("");
        setBody("");
      },
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <PostFields
        idPrefix="blog-new"
        title={title}
        onTitle={setTitle}
        body={body}
        onBody={setBody}
        disabled={action.pending}
      />
      <FormError>{action.error}</FormError>
      <PendingButton
        type="submit"
        className="self-start"
        pending={action.pending}
        pendingLabel="saving…"
        disabled={!title.trim()}
      >
        save draft
      </PendingButton>
    </form>
  );
}

function PostRow({ post: p }: { post: BlogPost }) {
  const action = useAction();
  const edit = useAction({ inline: true });
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(p.title);
  const [body, setBody] = React.useState(p.body);
  const published = p.publishedAt !== null;

  function startEditing() {
    setTitle(p.title);
    setBody(p.body);
    edit.setError(null);
    setEditing(true);
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    edit.run("save", () => updateBlogPost(p.id, title, body), {
      onSuccess: () => setEditing(false),
    });
  }

  return (
    <RowCard>
      {editing ? (
        <form onSubmit={save} className="flex flex-col gap-3" noValidate>
          <PostFields
            idPrefix={`blog-${p.id}`}
            title={title}
            onTitle={setTitle}
            body={body}
            onBody={setBody}
            disabled={edit.pending}
            autoFocus
          />
          <FormError>{edit.error}</FormError>
          <div className="flex gap-2">
            <PendingButton
              type="submit"
              size="sm"
              pending={edit.pending}
              pendingLabel="saving…"
              disabled={!title.trim()}
            >
              save
            </PendingButton>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={edit.pending}
              onClick={() => setEditing(false)}
            >
              cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 font-medium">
                <span className="break-words">{p.title}</span>
                <Badge variant={published ? "default" : "secondary"}>
                  {published ? "Published" : "Draft"}
                </Badge>
              </p>
              <p className="text-muted-foreground">
                {published
                  ? `Published ${shortDate(p.publishedAt!)}`
                  : `Saved ${shortDate(p.updatedAt)}`}
                {" · "}
                <a
                  href={blogPostHref(p.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  {published ? "View" : "Preview"}
                </a>
              </p>
            </div>
            <button
              type="button"
              onClick={startEditing}
              className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Edit
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <PendingButton
              type="button"
              size="sm"
              variant={published ? "outline" : "default"}
              pending={action.pendingKey === "publish"}
              disabled={action.pending}
              pendingLabel={published ? "unpublishing…" : "publishing…"}
              onClick={() =>
                action.run("publish", () => setBlogPostPublished(p.id, !published))
              }
            >
              {published ? "unpublish" : "publish"}
            </PendingButton>
            <ConfirmDialog
              trigger={
                <Button type="button" size="sm" variant="outline" disabled={action.pending}>
                  delete
                </Button>
              }
              title={`Delete “${p.title}”?`}
              description="This cannot be undone."
              confirmLabel="delete"
              pendingLabel="deleting…"
              onConfirm={() => deleteBlogPost(p.id, p.slug)}
            />
          </div>
        </>
      )}
    </RowCard>
  );
}
