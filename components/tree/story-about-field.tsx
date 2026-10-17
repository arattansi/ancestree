"use client";

import * as React from "react";

import { CompanionPicker, type CompanionOption } from "@/components/tree/companion-picker";
import { STORY_ABOUT_MAX } from "@/lib/limits";
import { mentionedIn } from "@/lib/story-mentions";

/** How long the text rests before it's read for names again. */
const READ_AFTER_MS = 400;

/**
 * Whom a story is about (Step 183): anyone on the canvas, each of whom has
 * it on their details. Those its words name are offered first
 * (`mentionedIn`, as Step 116's mentions were), read again once the typing
 * rests. Someone it's about already whom this canvas doesn't have stays
 * offered by name.
 */
export function StoryAboutField({
  people,
  body,
  value,
  onChange,
  disabled,
  known = [],
}: {
  /** Everyone on the canvas. */
  people: CompanionOption[];
  /** The story's text, read for names. */
  body: string;
  value: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  /** Whom it's about already, by name, for those this canvas lacks. */
  known?: { id: string; name: string }[];
}) {
  const options = React.useMemo(() => {
    const have = new Set(people.map((p) => p.id));
    const extra = known
      .filter((k) => !have.has(k.id))
      .map((k) => ({ id: k.id, label: k.name }));
    return [...people, ...extra];
  }, [people, known]);

  // The text as last read: not on every key, since a story may be long.
  const [read, setRead] = React.useState(body);
  React.useEffect(() => {
    if (body === read) return;
    const timer = window.setTimeout(() => setRead(body), READ_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [body, read]);
  const suggested = React.useMemo(() => mentionedIn(read, options), [read, options]);

  return (
    <CompanionPicker
      label="About"
      options={options}
      suggested={suggested}
      value={value}
      onChange={(ids) => onChange(ids.slice(0, STORY_ABOUT_MAX))}
      disabled={disabled}
      emptyHint={null}
    />
  );
}
