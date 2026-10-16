"use client";

import * as React from "react";

import {
  deleteBlogPost,
  saveBlogPost,
  setBlogPostPublished,
} from "@/app/actions/blog";
import { AdminSubmissions } from "@/components/admin/admin-submissions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormError } from "@/components/form-error";
import { AboutFields, useAbout } from "@/components/library/about-fields";
import { LibraryCard } from "@/components/library/library-card";
import { PostArticle } from "@/components/library/post-article";
import { PendingButton } from "@/components/pending-button";
import { RowCard, RowList } from "@/components/row-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import {
  BLOG_KIND_LABEL,
  blogMetaSuggestions,
  blogPostHref,
  BLOG_MARK,
  coverPhotoUrl,
  type BlogPost,
} from "@/lib/blog";
import { compressImage } from "@/lib/image";
import type { LibrarySubmission } from "@/lib/library-submissions";
import {
  BLOG_BODY_MAX,
  BLOG_COVER_EDGE,
  BLOG_META_DESCRIPTION_MAX,
  BLOG_META_TITLE_MAX,
  BLOG_TITLE_MAX,
} from "@/lib/limits";
import { shortDate } from "@/lib/short-date";
import { cn } from "@/lib/utils";

/**
 * The library on the admin page's blog tab (Step 134, Step 135): write a
 * post as a draft, with its kind, the people it profiles, a cover photo,
 * its Markdown and its meta title and description, a live preview beside
 * the form that puts the ancestree mark between blocks; then edit it, open
 * it, publish it (or take it back to a draft), and delete it. Drafts sit
 * first in the list. Since Step 154 the tab opens on the list, under a
 * "new draft" button, with no form until one's asked for: a draft is
 * picked to edit, or a new one started; a new draft, once saved, stays
 * open as itself. Since Step 157 the stories sent in from /library/submit
 * sit above the posts, to triage; one made a draft opens below to edit.
 */
export function AdminBlog({
  posts,
  submissions,
}: {
  posts: BlogPost[];
  submissions: LibrarySubmission[];
}) {
  const [active, setActive] = React.useState<string | null>(null);
  const [writing, setWriting] = React.useState(false);
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set());
  const scrollTo = React.useRef<string | null>(null);

  function openPost(id: string) {
    setOpen((o) => new Set(o).add(id));
    setActive(editorId(id));
  }

  // A draft opened from a story sent in, brought into view once its row is drawn.
  React.useEffect(() => {
    const id = scrollTo.current;
    const row = id ? document.getElementById(rowId(id)) : null;
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "start" });
    scrollTo.current = null;
  }, [open, posts]);

  function closePost(id: string) {
    setOpen((o) => {
      const next = new Set(o);
      next.delete(id);
      return next;
    });
    setActive((a) => (a === editorId(id) ? null : a));
  }

  function startDraft() {
    setWriting(true);
    setActive(NEW_EDITOR);
  }

  function stopDraft(savedId?: string) {
    setWriting(false);
    setActive((a) => (a === NEW_EDITOR ? null : a));
    if (savedId) openPost(savedId);
  }

  return (
    <ActiveEditor.Provider value={{ active, setActive }}>
      <Card id="submissions" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Stories Sent In</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminSubmissions
            submissions={submissions}
            onOpenPost={(id) => {
              scrollTo.current = id;
              openPost(id);
            }}
          />
        </CardContent>
      </Card>
      <Card id="blog" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Stories of Our Wise</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {writing ? (
            <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
              <PostEditor idPrefix={NEW_EDITOR} onDone={stopDraft} />
            </div>
          ) : (
            <Button type="button" className="self-start" onClick={startDraft}>
              new draft
            </Button>
          )}
          <RowList items={posts} empty="No posts yet.">
            {(p) => (
              <PostRow
                key={p.id}
                post={p}
                editing={open.has(p.id)}
                onEdit={() => openPost(p.id)}
                onDone={() => closePost(p.id)}
              />
            )}
          </RowList>
        </CardContent>
      </Card>
    </ActiveEditor.Provider>
  );
}

const NEW_EDITOR = "blog-new";

/** A post's editor, as the active one is named. */
const editorId = (postId: string) => `blog-${postId}`;

/** A post's row in the list. */
const rowId = (postId: string) => `post-${postId}`;

/**
 * Which open editor's preview floats beside the page from `xl` (the one
 * last opened, pressed or typed in; none once it's closed): one at a time,
 * since they share the same spot.
 */
const ActiveEditor = React.createContext<{
  active: string | null;
  setActive: (id: string) => void;
}>({ active: null, setActive: () => {} });

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
  ["blank line", "a new paragraph"],
  [BLOG_MARK, "the ancestree mark (or + between blocks in the preview)"],
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
  /** Called on cancel, and once saved, with the post's id. */
  onDone: (savedId?: string) => void;
}) {
  const action = useAction({ inline: true });
  const focus = React.useContext(ActiveEditor);
  const active = focus.active === idPrefix;
  const [title, setTitle] = React.useState(post?.title ?? "");
  const [body, setBody] = React.useState(post?.body ?? "");
  const [metaTitle, setMetaTitle] = React.useState(post?.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = React.useState(
    post?.metaDescription ?? "",
  );
  const about = useAbout(post?.kind, post?.people);
  const { kind, people } = about;
  const [cover, setCover] = React.useState<File | null>(null);
  const [coverUrl, setCoverUrl] = React.useState<string | null>(
    coverPhotoUrl(post?.coverPath ?? null),
  );
  const [removeCover, setRemoveCover] = React.useState(false);
  const [coverBusy, setCoverBusy] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const coverInput = React.useRef<HTMLInputElement>(null);
  const over = body.trim().length - BLOG_BODY_MAX;
  const editing = !!post;
  const suggested = blogMetaSuggestions(title, body);

  // A picked cover's preview address, let go once it's replaced or dropped.
  function showCover(url: string | null) {
    setCoverUrl((was) => {
      if (was?.startsWith("blob:")) URL.revokeObjectURL(was);
      return url;
    });
  }

  async function pickCover(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setCoverBusy(true);
    try {
      const small = await compressImage(file, { maxEdge: BLOG_COVER_EDGE });
      if (!small) {
        action.setError(
          "That photo couldn’t be read. Try a JPEG, PNG or WebP.",
        );
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
    data.set("metaTitle", metaTitle);
    data.set("metaDescription", metaDescription);
    if (cover) data.set("cover", cover, cover.name);
    if (removeCover) data.set("removeCover", "1");
    action.run("save", () => saveBlogPost(data), {
      onSuccess: (result) => onDone(result.id),
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
            autoFocus
            required
          />
        </div>

        <AboutFields idPrefix={idPrefix} about={about} disabled={action.pending} />

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
              {coverBusy
                ? "reading…"
                : coverUrl
                  ? "change photo"
                  : "choose photo"}
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
          <Label htmlFor={`${idPrefix}-body`}>
            Post (
            <button
              type="button"
              onClick={() => setHelpOpen((o) => !o)}
              aria-expanded={helpOpen}
              className="underline underline-offset-4 hover:text-muted-foreground"
            >
              Markdown helper
            </button>
            )
          </Label>
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
            {over > 0
              ? `Too long by ${over.toLocaleString("en")} characters.`
              : null}
          </FormError>
          {helpOpen ? (
            <MarkdownHelp onClose={() => setHelpOpen(false)} />
          ) : null}
        </div>

        <MetaField
          id={`${idPrefix}-meta-title`}
          label="Meta title"
          value={metaTitle}
          onChange={setMetaTitle}
          max={BLOG_META_TITLE_MAX}
          suggestion={suggested.title}
          disabled={action.pending}
        />
        <MetaField
          id={`${idPrefix}-meta-description`}
          label="Meta description"
          value={metaDescription}
          onChange={setMetaDescription}
          max={BLOG_META_DESCRIPTION_MAX}
          suggestion={suggested.description}
          disabled={action.pending}
          multiline
        />

        <FormError>{action.error}</FormError>
        <div className="flex gap-2">
          <PendingButton
            type="submit"
            size="sm"
            pending={action.pending}
            pendingLabel="saving…"
            disabled={!title.trim() || coverBusy}
          >
            {editing ? "save" : "save draft"}
          </PendingButton>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={action.pending}
            onClick={() => onDone()}
          >
            cancel
          </Button>
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
          <p className="mb-3 text-xs text-muted-foreground">
            On /library (hover to see the card)
          </p>
          <div className="flex justify-center">
            <LibraryCard
              post={{ ...preview, coverPath: null }}
              href={null}
              coverUrl={coverUrl}
            />
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
            onBodyChange={action.pending ? undefined : setBody}
          />
        </div>
      </div>
    </>
  );
}

/**
 * A post's meta title or description: what search engines and link
 * previews show, the post's own title and first words (its suggestion,
 * greyed in) when left empty; its count against the limit beside the
 * label. "Autofill" puts the suggestion in to edit, as Tab does in the
 * empty field (Step 154).
 */
function MetaField({
  id,
  label,
  value,
  onChange,
  max,
  suggestion,
  disabled,
  multiline = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  /** Empty when there's nothing to suggest yet. */
  suggestion: string;
  disabled: boolean;
  multiline?: boolean;
}) {
  const field = {
    id,
    value,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => onChange(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== "Tab" || e.shiftKey || value || !suggestion) return;
      e.preventDefault();
      onChange(suggestion);
    },
    maxLength: max,
    placeholder: suggestion || undefined,
    disabled,
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className="flex items-baseline gap-3 text-xs text-muted-foreground">
          {suggestion && value.trim() !== suggestion ? (
            <button
              type="button"
              onClick={() => onChange(suggestion)}
              disabled={disabled}
              aria-label={`Autofill ${label.toLowerCase()}`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              Autofill
            </button>
          ) : null}
          <span className="tabular-nums">
            {value.trim().length}/{max}
          </span>
        </span>
      </div>
      {multiline ? (
        <Textarea {...field} rows={2} className="text-sm" />
      ) : (
        <Input {...field} autoComplete="off" />
      )}
    </div>
  );
}

function PostRow({
  post: p,
  editing,
  onEdit,
  onDone,
}: {
  post: BlogPost;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  const action = useAction();
  const published = p.publishedAt !== null;

  return (
    <RowCard id={rowId(p.id)} className="scroll-mt-20">
      {editing ? (
        <PostEditor idPrefix={editorId(p.id)} post={p} onDone={onDone} />
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
                {BLOG_KIND_LABEL[p.kind]}
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
              onClick={onEdit}
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
                action.run("publish", () =>
                  setBlogPostPublished(p.id, !published),
                )
              }
            >
              {published ? "unpublish" : "publish"}
            </PendingButton>
            <ConfirmDialog
              trigger={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={action.pending}
                >
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
