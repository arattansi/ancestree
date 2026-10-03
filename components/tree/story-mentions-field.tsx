"use client";

import * as React from "react";

import { CompanionPicker, type CompanionOption } from "@/components/tree/companion-picker";
import { STORY_MENTION_MAX } from "@/lib/limits";
import { mentionedIn } from "@/lib/story-mentions";

/** How long the text rests before it's read for names again. */
const READ_AFTER_MS = 400;

/**
 * Who a written story mentions (Step 116): anyone on the canvas but the
 * story's own person, with those the text names offered first
 * (`mentionedIn`), read again once the typing rests. Someone already tagged
 * whom this canvas doesn't have stays offered by name.
 */
export function StoryMentionsField({
  people,
  personId,
  body,
  value,
  onChange,
  disabled,
  known = [],
}: {
  /** Everyone on the canvas. */
  people: CompanionOption[];
  /** Whom the story is about, who isn't offered. */
  personId: string;
  /** The story's text, read for names. */
  body: string;
  value: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  /** Who it mentions already, by name, for those this canvas lacks. */
  known?: { id: string; name: string }[];
}) {
  const options = React.useMemo(() => {
    const offered = people.filter((p) => p.id !== personId);
    const have = new Set(offered.map((p) => p.id));
    const extra = known
      .filter((k) => !have.has(k.id) && k.id !== personId)
      .map((k) => ({ id: k.id, label: k.name }));
    return [...offered, ...extra];
  }, [people, personId, known]);

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
      label="People mentioned"
      options={options}
      suggested={suggested}
      value={value}
      onChange={(ids) => onChange(ids.slice(0, STORY_MENTION_MAX))}
      disabled={disabled}
      emptyHint={null}
    />
  );
}
