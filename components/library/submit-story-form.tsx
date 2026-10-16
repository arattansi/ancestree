"use client";

import * as React from "react";
import Link from "next/link";

import { submitLibraryStory, type SubmitStoryResult } from "@/app/actions/library-submissions";
import { FormError } from "@/components/form-error";
import { AboutFields, useAbout } from "@/components/library/about-fields";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import { BLOG_NAME, blogSubmissionHref } from "@/lib/blog";
import { MAX_EMAIL_LENGTH } from "@/lib/email-address";
import { compressImage } from "@/lib/image";
import { countWords } from "@/lib/library-submissions";
import {
  BLOG_COVER_EDGE,
  BLOG_TITLE_MAX,
  LIBRARY_SUBMISSION_BODY_MAX,
  LIBRARY_SUBMISSION_WORDS_MAX,
} from "@/lib/limits";
import { cn } from "@/lib/utils";

/**
 * Send in the story of someone who has passed (Step 157): the admin
 * page's draft form, without its preview or meta fields — a title, who
 * it's about, a photo, the story — and the sender's email and their
 * agreement that it may be edited to fit the library. The story counts
 * its words against the 2,000 it may have (157.5). Once sent it says
 * where the copy went, with the copy's own page a link away.
 */
export function SubmitStoryForm() {
  const action = useAction({ inline: true });
  const about = useAbout();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [agreed, setAgreed] = React.useState(false);
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [sent, setSent] = React.useState<Exclude<SubmitStoryResult, { error: string }> | null>(
    null,
  );
  const photoInput = React.useRef<HTMLInputElement>(null);
  const website = React.useRef<HTMLInputElement>(null);
  const words = countWords(body);
  const wordsOver = words - LIBRARY_SUBMISSION_WORDS_MAX;
  const charsOver = body.trim().length - LIBRARY_SUBMISSION_BODY_MAX;
  const over = wordsOver > 0 || charsOver > 0;

  // A picked photo's preview address, let go once it's replaced or dropped.
  function showPhoto(url: string | null) {
    setPhotoUrl((was) => {
      if (was?.startsWith("blob:")) URL.revokeObjectURL(was);
      return url;
    });
  }

  async function pickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const small = await compressImage(file, { maxEdge: BLOG_COVER_EDGE });
      if (!small) {
        action.setError("That photo couldn’t be read. Try a JPEG, PNG or WebP.");
        return;
      }
      setPhoto(small);
      showPhoto(URL.createObjectURL(small));
    } finally {
      setPhotoBusy(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    data.set("title", title);
    data.set("body", body);
    data.set("kind", about.kind);
    data.set("people", JSON.stringify(about.people));
    data.set("email", email);
    if (agreed) data.set("agreed", "1");
    data.set("website", website.current?.value ?? "");
    if (photo) data.set("photo", photo, photo.name);
    action.run("send", () => submitLibraryStory(data), {
      onSuccess: (result) => {
        if ("error" in result) return;
        showPhoto(null);
        setSent(result);
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
    });
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-3 text-sm" role="status">
        <p>
          {sent.emailed
            ? `Thank you. A copy is on its way to ${sent.email}.`
            : "Thank you. It’s sent, but the copy couldn’t be emailed."}
        </p>
        {sent.token ? (
          <p className="text-muted-foreground">
            <Link
              href={blogSubmissionHref(sent.token)}
              className="underline underline-offset-4 hover:text-foreground"
            >
              See what you sent
            </Link>
            , or ask for a change there.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="story-title">Title</Label>
        <Input
          id="story-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={BLOG_TITLE_MAX}
          disabled={action.pending}
          autoComplete="off"
          required
        />
      </div>

      <AboutFields idPrefix="story" about={about} disabled={action.pending} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="story-photo">Photo</Label>
        <div className="flex flex-wrap items-center gap-3">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-16 w-16 rounded-md border object-cover" />
          ) : null}
          <input
            ref={photoInput}
            id="story-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={pickPhoto}
            disabled={action.pending || photoBusy}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={action.pending || photoBusy}
            onClick={() => photoInput.current?.click()}
          >
            {photoBusy ? "reading…" : photoUrl ? "change photo" : "choose photo"}
          </Button>
          {photoUrl ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={action.pending}
              onClick={() => {
                setPhoto(null);
                showPhoto(null);
              }}
            >
              remove photo
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="story-body">Their story</Label>
          <span
            id="story-body-count"
            className={cn(
              "text-xs tabular-nums text-muted-foreground",
              wordsOver > 0 && "font-medium text-destructive",
            )}
          >
            {words.toLocaleString("en")}/{LIBRARY_SUBMISSION_WORDS_MAX.toLocaleString("en")} words
          </span>
        </div>
        <Textarea
          id="story-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          disabled={action.pending}
          aria-invalid={over}
          aria-describedby="story-body-count"
          className="max-h-[60dvh]"
          required
        />
        <FormError>
          {wordsOver > 0
            ? `Too long by ${wordsOver.toLocaleString("en")} ${wordsOver === 1 ? "word" : "words"}.`
            : charsOver > 0
              ? `Too long by ${charsOver.toLocaleString("en")} characters.`
              : null}
        </FormError>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="story-email">Your email</Label>
        <Input
          id="story-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={MAX_EMAIL_LENGTH}
          disabled={action.pending}
          required
          className="sm:max-w-xs"
        />
      </div>

      {/* Left empty by people; a bot that fills it in is answered as sent. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="story-website">Website</label>
        <input
          ref={website}
          id="story-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <label htmlFor="story-agreed" className="flex items-start gap-2 text-sm">
        <Checkbox
          id="story-agreed"
          checked={agreed}
          onCheckedChange={(checked) => setAgreed(checked === true)}
          disabled={action.pending}
          className="mt-0.5"
        />
        <span>It may be edited to fit {BLOG_NAME}.</span>
      </label>

      <FormError>{action.error}</FormError>
      <PendingButton
        type="submit"
        className="self-start"
        pending={action.pending}
        pendingLabel="sending…"
        disabled={photoBusy || over}
      >
        send
      </PendingButton>
    </form>
  );
}
