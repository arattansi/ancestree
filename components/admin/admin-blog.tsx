"use client";

import * as React from "react";

import { deleteBlogPost, saveBlogPost, setBlogPostPublished } from "@/app/actions/blog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormError } from "@/components/form-error";
import { LibraryCard } from "@/components/library/library-card";
import { PostArticle } from "@/components/library/post-article";
import { PendingButton } from "@/components/pending-button";
import { RowCard, RowList } from "@/components/row-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import {
  BLOG_KINDS,
  BLOG_PEOPLE_MAX,
  BLOG_PERSON_NAME_MAX,
  BLOG_PERSON_PLACE_MAX,
  blogPostHref,
  coverPhotoUrl,
  type BlogKind,
  type BlogPerson,
  type BlogPost,
} from "@/lib/blog";
import { compressImage } from "@/lib/image";
import { BLOG_BODY_MAX, BLOG_COVER_EDGE, BLOG_TITLE_MAX } from "@/lib/limits";
import { shortDate } from "@/lib/short-date";

/**
 * The library on the admin page's blog tab (Step 134, Step 135): write a
 * post as a draft, with its kind, the people it profiles, a cover photo
 * and its Markdown, a live preview beside the form; then edit it, open
 * it, publish it (or take it back to a draft), and delete it. Drafts sit
 * first in the list.
 */
export function AdminBlog({ posts }: { posts: BlogPost[] }) {
  return (
    <div className="flex flex-col gap-6">
      <PostEditor idPrefix="blog-new" />
      <RowList items={posts} empty="No posts yet.">
        {(p) => <PostRow key={p.id} post={p} />}
      </RowList>
    </div>
  );
}

const KIND_LABEL: Record<BlogKind, string> = {
  person: "One person",
  couple: "A couple",
  family: "A family",
};

const EMPTY_PERSON: BlogPerson = { first: "", last: "", maiden: "", place: "" };

/** The rows a kind needs: one for a person, two for a couple, at least one for a family. */
function peopleFor(kind: BlogKind, people: BlogPerson[]): BlogPerson[] {
  const want = kind === "person" ? 1 : kind === "couple" ? 2 : Math.max(1, people.length);
  const next = people.slice(0, kind === "family" ? BLOG_PEOPLE_MAX : want);
  while (next.length < want) next.push({ ...EMPTY_PERSON });
  return next;
}

/**
 * The form for a post, new or being edited, with the preview beside it
 * from `lg`: the card as it sits on /library and the post as it reads.
 */
function PostEditor({
  idPrefix,
  post,
  onDone,
}: {
  idPrefix: string;
  post?: BlogPost;
  /** Editing: called once saved, or on cancel. */
  onDone?: () => void;
}) {
  const action = useAction({ inline: true });
  const [title, setTitle] = React.useState(post?.title ?? "");
  const [body, setBody] = React.useState(post?.body ?? "");
  const [kind, setKind] = React.useState<BlogKind>(post?.kind ?? "person");
  const [people, setPeople] = React.useState<BlogPerson[]>(() =>
    peopleFor(post?.kind ?? "person", post?.people ?? []),
  );
  const [cover, setCover] = React.useState<File | null>(null);
  const [coverUrl, setCoverUrl] = React.useState<string | null>(
    coverPhotoUrl(post?.coverPath ?? null),
  );
  const [removeCover, setRemoveCover] = React.useState(false);
  const [coverBusy, setCoverBusy] = React.useState(false);
  const coverInput = React.useRef<HTMLInputElement>(null);
  const over = body.trim().length - BLOG_BODY_MAX;
  const editing = !!post;

  // A picked cover's preview address, let go once it's replaced or dropped.
  function showCover(url: string | null) {
    setCoverUrl((was) => {
      if (was?.startsWith("blob:")) URL.revokeObjectURL(was);
      return url;
    });
  }

  function changeKind(next: BlogKind) {
    setKind(next);
    setPeople((p) => peopleFor(next, p));
  }

  function setPerson(index: number, field: keyof BlogPerson, value: string) {
    setPeople((p) => p.map((person, i) => (i === index ? { ...person, [field]: value } : person)));
  }

  async function pickCover(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setCoverBusy(true);
    try {
      const small = await compressImage(file, { maxEdge: BLOG_COVER_EDGE });
      if (!small) {
        action.setError("That photo couldn’t be read. Try a JPEG, PNG or WebP.");
        return;
      }
      setCover(small);
      showCover(URL.createObjectURL(small));
      setRemoveCover(false);
    } finally {
      setCoverBusy(false);
    }
  }

  function clearCover() {
    setCover(null);
    showCover(null);
    setRemoveCover(!!post?.coverPath);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    if (post) data.set("id", post.id);
    data.set("title", title);
    data.set("body", body);
    data.set("kind", kind);
    data.set("people", JSON.stringify(people));
    if (cover) data.set("cover", cover, cover.name);
    if (removeCover) data.set("removeCover", "1");
    action.run("save", () => saveBlogPost(data), {
      onSuccess: () => {
        if (post) {
          onDone?.();
          return;
        }
        setTitle("");
        setBody("");
        setKind("person");
        setPeople(peopleFor("person", []));
        setCover(null);
        showCover(null);
        setRemoveCover(false);
      },
    });
  }

  const preview = {
    slug: post?.slug ?? "preview",
    title,
    body,
    kind,
    people: people.filter((p) => p.first || p.last),
    coverPath: null,
  };

  return (
    <form
      onSubmit={submit}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      noValidate
    >
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-title`}>Title</Label>
          <Input
            id={`${idPrefix}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={BLOG_TITLE_MAX}
            disabled={action.pending}
            autoComplete="off"
            autoFocus={editing}
            required
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">About</legend>
          <RadioGroup
            value={kind}
            onValueChange={(v) => changeKind(v as BlogKind)}
            className="flex flex-wrap gap-4"
            disabled={action.pending}
          >
            {BLOG_KINDS.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <RadioGroupItem value={k} />
                {KIND_LABEL[k]}
              </label>
            ))}
          </RadioGroup>
        </fieldset>

        <div className="flex flex-col gap-3">
          {people.map((person, i) => (
            <PersonFields
              key={i}
              idPrefix={`${idPrefix}-person-${i}`}
              index={i}
              person={person}
              onChange={(field, value) => setPerson(i, field, value)}
              onRemove={
                kind === "family" && people.length > 1
                  ? () => setPeople((p) => p.filter((_, j) => j !== i))
                  : undefined
              }
              disabled={action.pending}
            />
          ))}
          {kind === "family" && people.length < BLOG_PEOPLE_MAX ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-start"
              disabled={action.pending}
              onClick={() => setPeople((p) => [...p, { ...EMPTY_PERSON }])}
            >
              add a person
            </Button>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-cover`}>Cover photo</Label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={coverInput}
              id={`${idPrefix}-cover`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={pickCover}
              disabled={action.pending || coverBusy}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={action.pending || coverBusy}
              onClick={() => coverInput.current?.click()}
            >
              {coverBusy ? "reading…" : coverUrl ? "change photo" : "choose photo"}
            </Button>
            {coverUrl ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={action.pending}
                onClick={clearCover}
              >
                remove photo
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-body`}>Post (Markdown)</Label>
          <Textarea
            id={`${idPrefix}-body`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            disabled={action.pending}
            aria-invalid={over > 0}
            className="max-h-[60dvh] font-mono text-xs"
          />
          <FormError>
            {over > 0 ? `Too long by ${over.toLocaleString("en")} characters.` : null}
          </FormError>
        </div>

        <FormError>{action.error}</FormError>
        <div className="flex gap-2">
          <PendingButton
            type="submit"
            size={editing ? "sm" : undefined}
            pending={action.pending}
            pendingLabel="saving…"
            disabled={!title.trim() || coverBusy}
          >
            {editing ? "save" : "save draft"}
          </PendingButton>
          {editing ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={action.pending}
              onClick={onDone}
            >
              cancel
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        <p className="text-xs font-medium text-muted-foreground">Preview</p>
        <div className="rounded-lg border bg-background p-4">
          <p className="mb-3 text-xs text-muted-foreground">On /library (hover to see the card)</p>
          <div className="flex justify-center">
            <LibraryCard post={{ ...preview, coverPath: null }} href={null} coverUrl={coverUrl} />
          </div>
        </div>
        <div className="max-h-[70dvh] overflow-y-auto rounded-lg border bg-background p-4">
          <PostArticle
            title={title}
            dateLine={
              post?.publishedAt
                ? shortDate(post.publishedAt)
                : `saved ${shortDate(post?.updatedAt ?? new Date())}`
            }
            draft={!post?.publishedAt}
            coverUrl={coverUrl}
            body={body}
          />
        </div>
      </div>
    </form>
  );
}

function PersonFields({
  idPrefix,
  index,
  person,
  onChange,
  onRemove,
  disabled,
}: {
  idPrefix: string;
  index: number;
  person: BlogPerson;
  onChange: (field: keyof BlogPerson, value: string) => void;
  onRemove?: () => void;
  disabled: boolean;
}) {
  const field = (
    key: keyof BlogPerson,
    label: string,
    max: number,
    autoComplete = "off",
  ) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`${idPrefix}-${key}`} className="text-xs">
        {label}
      </Label>
      <Input
        id={`${idPrefix}-${key}`}
        value={person[key]}
        onChange={(e) => onChange(key, e.target.value)}
        maxLength={max}
        disabled={disabled}
        autoComplete={autoComplete}
      />
    </div>
  );
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Person {index + 1}</p>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Remove
          </button>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {field("first", "First name", BLOG_PERSON_NAME_MAX)}
        {field("last", "Last name", BLOG_PERSON_NAME_MAX)}
        {field("maiden", "Maiden name", BLOG_PERSON_NAME_MAX)}
        {field("place", "Place of birth", BLOG_PERSON_PLACE_MAX)}
      </div>
    </div>
  );
}

function PostRow({ post: p }: { post: BlogPost }) {
  const action = useAction();
  const [editing, setEditing] = React.useState(false);
  const published = p.publishedAt !== null;

  return (
    <RowCard>
      {editing ? (
        <PostEditor idPrefix={`blog-${p.id}`} post={p} onDone={() => setEditing(false)} />
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
                {KIND_LABEL[p.kind]}
                {p.people.length
                  ? `: ${p.people.map((x) => [x.first, x.last].filter(Boolean).join(" ")).join(", ")}`
                  : ""}
                {p.coverPath ? " · cover photo" : " · no cover photo"}
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
              onClick={() => setEditing(true)}
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
