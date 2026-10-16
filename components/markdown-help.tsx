"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

/** How to write it, beside the text: the Markdown a post or a note can use. */
export const MARKDOWN_HELP: [syntax: string, means: string][] = [
  ["**bold**", "bold"],
  ["_italics_", "italics"],
  ["# Heading", "a heading (## for a smaller one)"],
  ["- point", "a bullet point, one per line"],
  ["1. first", "a numbered list"],
  ["> words", "a quotation"],
  ["[words](https://…)", "a link"],
  ["---", "a line across"],
  ["blank line", "a new paragraph"],
];

/**
 * "Markdown helper", in a field's label, as the blog tab's post has it
 * (Step 134) and the newsletter's note (Step 159): opens and closes
 * `MarkdownHelp`.
 */
export function MarkdownHelpButton({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenChange(!open)}
      aria-expanded={open}
      className="underline underline-offset-4 hover:text-muted-foreground"
    >
      Markdown helper
    </button>
  );
}

/**
 * The helper, while it's open: a pop-up to the card's left from `xl`
 * (the blog preview's mirror), under the text box narrower.
 */
export function MarkdownHelp({
  rows = MARKDOWN_HELP,
  onClose,
}: {
  rows?: [syntax: string, means: string][];
  onClose: () => void;
}) {
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
        {rows.map(([syntax, means]) => (
          <React.Fragment key={syntax}>
            <dt className="font-mono text-foreground">{syntax}</dt>
            <dd>{means}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}
