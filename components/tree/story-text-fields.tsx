"use client";

import { FormError } from "@/components/form-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STORY_MAX, STORY_TITLE_MAX } from "@/lib/limits";
import { cn } from "@/lib/utils";

/**
 * A story's title and its text (Step 99), as it's told and as its teller
 * edits it (Step 99.7). Step 113 took out the Markdown Write / Preview and
 * the file upload (Aalim: "pointless"); stories saved with Markdown still
 * show it. `roomy` gives the text most of the window, for a story written
 * here. Text past the limit stays, and says so, rather than being cut off.
 */
export function StoryTextFields({
  idPrefix,
  title,
  onTitle,
  body,
  onBody,
  disabled,
  roomy = false,
}: {
  /** Keeps the labels' ids apart from another form's. */
  idPrefix: string;
  title: string;
  onTitle: (title: string) => void;
  body: string;
  onBody: (body: string) => void;
  disabled: boolean;
  /** A tall box, in a big window (Step 113). */
  roomy?: boolean;
}) {
  const titleId = `${idPrefix}-title`;
  const bodyId = `${idPrefix}-body`;
  const over = body.trim().length - STORY_MAX;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={titleId}>Title</Label>
        <Input
          id={titleId}
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          maxLength={STORY_TITLE_MAX}
          disabled={disabled}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={bodyId}>Story</Label>
        <Textarea
          id={bodyId}
          value={body}
          onChange={(e) => onBody(e.target.value)}
          rows={8}
          disabled={disabled}
          aria-invalid={over > 0}
          className={cn(roomy ? "h-[55dvh] resize-none" : "max-h-[50dvh]")}
        />
        <FormError>
          {over > 0 ? `Too long by ${over.toLocaleString("en")} characters.` : null}
        </FormError>
      </div>
    </>
  );
}
