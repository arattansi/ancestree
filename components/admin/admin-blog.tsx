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
import { cn } from "@/lib/utils";

/**
 * The library on the admin page's blog tab (Step 134, Step 135): write a
 * post as a draft, with its kind, the people it profiles, a cover photo
 * and its Markdown, a live preview beside the form; then edit it, open
 * it, publish it (or take it back to a draft), and delete it. Drafts sit
 * first in the list.
 */
export function AdminBlog({ posts }: { posts: BlogPost[] }) {
  const [active, setActive] = React.useState(NEW_EDITOR);
  return (
    <ActiveEditor.Provider value={{ active, setActive }}>
      <div className="flex flex-col gap-6">
        <PostEditor idPrefix={NEW_EDITOR} />
        <RowList items={posts} empty="No posts yet.">
          {(p) => <PostRow key={p.id} post={p} />}
        </RowList>
      </div>
    </ActiveEditor.Provider>
  );
}

const NEW_EDITOR = "blog-new";

/**
 * Which editor's preview floats beside the page from `xl` (the new post's
 * until a post is opened for editing, or either once it's pressed or
 * typed in): one at a time, since they share the same spot.
 */
const ActiveEditor = React.createContext<{
  active: string;
  setActive: (id: string) => void;
}>({ active: NEW_EDITOR, setActive: () => {} });

/** How to write it, beside the text: the Markdown a post can use. */
const MARKDOWN_HELP: [syntax: string, means: string][] = [
  ["**bold**", "bold"],
  ["_italics_", "italics"],
  ["# Heading", "a heading (## for a smaller one)"],
  ["- point", "a bullet point, one per line"],
  ["1. first", "a numbered list"],
  ["> words", "a quotation"],
  ["[words](https://…)", "a link"],
  ["---", "a line across"],
  ["blank line", "a new paragraph (the mark goes between them)"],
];

/**
 * The helper, while it's open: a pop-up to the card's left from `xl`
 * (the preview's mirror), under the text box narrower.
 */
function MarkdownHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Markdown"
      className="rounded-lg border bg-background p-3 text-xs text-muted-foreground shadow-sm xl:fixed xl:top-20 xl:left-6 xl:z-20 xl:w-[min(20rem,calc(50vw-26rem))] xl:shadow-xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="font-medium text-foreground">Markdown</p>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          close
        </Button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {MARKDOWN_HELP.map(([syntax, means]) => (
          <React.Fragment key={syntax}>
            <dt className="font-mono text-foreground">{syntax}</dt>
            <dd>{means}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}

const KIND_LABEL: Record<BlogKind, string> = {
  person: "Individual",
  couple: "Couple",
  family: "Family",
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
 * The form for a post, new or being edited, with its preview: the card as
 * it sits on /library and the post as it reads. From `xl` the preview
 * floats at the page's right, outside the card, so it stays in view
 * however long the text gets; narrower, it follows the form.
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
  const focus = React.useContext(ActiveEditor);
  const active = focus.active === idPrefix;
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
  const [shown, setShown] = React.useState(0);
  const [helpOpen, setHelpOpen] = React.useState(false);
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
    setShown(0);
  }

  function addPerson() {
    setPeople((p) => [...p, { ...EMPTY_PERSON }]);
    setShown(people.length);
  }

  function removePerson(index: number) {
    setPeople((p) => p.filter((_, j) => j !== index));
    setShown((i) => Math.max(0, Math.min(i, people.length - 2)));
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
    <>
      <form
        onSubmit={submit}
        onFocusCapture={() => focus.setActive(idPrefix)}
        onPointerDownCapture={() => focus.setActive(idPrefix)}
        className="flex min-w-0 flex-col gap-4"
        noValidate
      >
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

        <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">About</legend>
            <RadioGroup
              value={kind}
              onValueChange={(v) => changeKind(v as BlogKind)}
              className="flex flex-row flex-wrap gap-x-4 gap-y-2 sm:flex-col"
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
          <PersonFields
            idPrefix={`${idPrefix}-person-${shown}`}
            person={people[shown] ?? people[0]}
            onChange={(field, value) => setPerson(shown, field, value)}
            tabs={
              people.length > 1 || kind === "family"
                ? {
                    count: people.length,
                    shown,
                    onShow: setShown,
                    onAdd:
                      kind === "family" && people.length < BLOG_PEOPLE_MAX
                        ? addPerson
                        : undefined,
                    onRemove:
                      kind === "family" && people.length > 1
                        ? () => removePerson(shown)
                        : undefined,
                  }
                : undefined
            }
            disabled={action.pending}
          />
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
          {helpOpen ? (
            <MarkdownHelp onClose={() => setHelpOpen(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Markdown help
            </button>
          )}
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
      </form>

      <div
        className={cn(
          "flex min-w-0 flex-col gap-4 xl:fixed xl:top-20 xl:right-6 xl:bottom-6 xl:z-20 xl:w-[min(26rem,calc(50vw-26rem))] xl:overflow-y-auto",
          !active && "xl:hidden",
        )}
      >
        <p className="text-xs font-medium text-muted-foreground">Preview</p>
        <div className="rounded-lg border bg-background p-4">
          <p className="mb-3 text-xs text-muted-foreground">On /library (hover to see the card)</p>
          <div className="flex justify-center">
            <LibraryCard post={{ ...preview, coverPath: null }} href={null} coverUrl={coverUrl} />
          </div>
        </div>
        <div className="max-h-[70dvh] overflow-y-auto rounded-lg border bg-background p-4 xl:max-h-none xl:overflow-visible">
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
    </>
  );
}

/**
 * One person's fields, in a small container beside the kinds. A couple or
 * a family switch between their people with the toggles along its top
 * ("person 1", "person 2" …); a family adds and removes them there too.
 */
function PersonFields({
  idPrefix,
  person,
  onChange,
  tabs,
  disabled,
}: {
  idPrefix: string;
  person: BlogPerson;
  onChange: (field: keyof BlogPerson, value: string) => void;
  tabs?: {
    count: number;
    shown: number;
    onShow: (index: number) => void;
    onAdd?: () => void;
    onRemove?: () => void;
  };
  disabled: boolean;
}) {
  const field = (key: keyof BlogPerson, label: string, max: number) => (
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
        autoComplete="off"
        className="h-8"
      />
    </div>
  );
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md border p-3">
      {tabs ? (
        <div className="flex flex-wrap items-center gap-1">
          <div
            role="group"
            aria-label="Person"
            className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5"
          >
            {Array.from({ length: tabs.count }, (_, i) => (
              <Button
                key={i}
                type="button"
                size="sm"
                variant={i === tabs.shown ? "default" : "ghost"}
                aria-pressed={i === tabs.shown}
                disabled={disabled}
                onClick={() => tabs.onShow(i)}
                className="h-7 px-2"
              >
                person {i + 1}
              </Button>
            ))}
            {tabs.onAdd ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Add a person"
                disabled={disabled}
                onClick={tabs.onAdd}
                className="h-7 px-2"
              >
                +
              </Button>
            ) : null}
          </div>
          {tabs.onRemove ? (
            <button
              type="button"
              onClick={tabs.onRemove}
              disabled={disabled}
              className="ml-auto text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
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
  const focus = React.useContext(ActiveEditor);
  const [editing, setEditing] = React.useState(false);
  const published = p.publishedAt !== null;
  const editorId = `blog-${p.id}`;

  function startEditing() {
    focus.setActive(editorId);
    setEditing(true);
  }

  function stopEditing() {
    focus.setActive(NEW_EDITOR);
    setEditing(false);
  }

  return (
    <RowCard>
      {editing ? (
        <PostEditor idPrefix={editorId} post={p} onDone={stopEditing} />
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
