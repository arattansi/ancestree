"use client";

import * as React from "react";
import { FileText } from "lucide-react";

import { FormError } from "@/components/form-error";
import { StoryText } from "@/components/tree/story-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STORY_MAX, STORY_TITLE_MAX } from "@/lib/limits";
import {
  STORY_FILE_ACCEPT,
  STORY_FILE_MAX_BYTES,
  addToStory,
  readStoryFile,
} from "@/lib/story-markdown";

/**
 * A story's title and its text (Step 99), as it's told and as its teller
 * edits it (Step 99.7): the text in Markdown, with **Write** / **Preview**,
 * or from a Markdown file, whose text goes after what's written and whose
 * title fills an empty one. Remount it (`key`) to start afresh.
 */
export function StoryTextFields({
  idPrefix,
  title,
  onTitle,
  body,
  onBody,
  disabled,
}: {
  /** Keeps the labels' ids apart from another form's. */
  idPrefix: string;
  title: string;
  onTitle: (title: string) => void;
  body: string;
  onBody: (body: string) => void;
  disabled: boolean;
}) {
  const [preview, setPreview] = React.useState(false);
  const [fileError, setFileError] = React.useState<string | null>(null);
  // A Markdown file being read: the title and story wait, so nothing typed
  // meanwhile is written over.
  const [readingFile, setReadingFile] = React.useState(false);
  const markdownRef = React.useRef<HTMLInputElement>(null);
  const titleId = `${idPrefix}-title`;
  const bodyId = `${idPrefix}-body`;
  const held = disabled || readingFile;

  async function onMarkdownFile(file: File) {
    setFileError(null);
    if (file.size > STORY_FILE_MAX_BYTES) {
      setFileError("That file is too big for a story.");
      return;
    }
    let text: string;
    setReadingFile(true);
    try {
      text = await file.text();
    } catch {
      setFileError("That file couldn’t be read.");
      return;
    } finally {
      setReadingFile(false);
    }
    if (text.includes("\u0000")) {
      setFileError("That isn’t a text file.");
      return;
    }
    const read = readStoryFile(text, STORY_TITLE_MAX);
    if (!read.body) {
      setFileError("That file is empty.");
      return;
    }
    const next = addToStory(body, read.body);
    if (next.length > STORY_MAX) {
      setFileError(
        `That’s longer than a story may be (${STORY_MAX.toLocaleString("en")} characters).`,
      );
      return;
    }
    onBody(next);
    if (!title.trim() && read.title) onTitle(read.title);
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={titleId}>Title</Label>
        <Input
          id={titleId}
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          maxLength={STORY_TITLE_MAX}
          disabled={held}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          {/* In Preview there's no box to name: the preview names itself. */}
          <Label htmlFor={preview ? undefined : bodyId}>Story</Label>
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant={preview ? "ghost" : "secondary"}
              aria-pressed={!preview}
              onClick={() => setPreview(false)}
            >
              write
            </Button>
            <Button
              type="button"
              size="sm"
              variant={preview ? "secondary" : "ghost"}
              aria-pressed={preview}
              onClick={() => setPreview(true)}
            >
              preview
            </Button>
          </div>
        </div>
        {preview ? (
          <div
            role="region"
            aria-label="Preview of the story"
            className="max-h-[50dvh] min-h-40 overflow-y-auto rounded-md border p-3 text-sm"
          >
            {body.trim() ? (
              <StoryText>{body}</StoryText>
            ) : (
              <p className="text-muted-foreground">Nothing to preview.</p>
            )}
          </div>
        ) : (
          <Textarea
            id={bodyId}
            value={body}
            onChange={(e) => onBody(e.target.value)}
            rows={8}
            maxLength={STORY_MAX}
            disabled={held}
            className="max-h-[50dvh]"
          />
        )}
        <input
          ref={markdownRef}
          type="file"
          accept={STORY_FILE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void onMarkdownFile(file);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          disabled={held}
          onClick={() => markdownRef.current?.click()}
        >
          <FileText aria-hidden />
          upload a Markdown file
        </Button>
        <FormError>{fileError}</FormError>
      </div>
    </>
  );
}
