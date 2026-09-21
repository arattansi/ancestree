"use client";

import * as React from "react";
import { X } from "lucide-react";

import { FitText } from "@/components/ui/fit-text";
import { Input } from "@/components/ui/input";
import { personDisplayName, personLifespan } from "@/lib/person-name";
import { matchesName } from "@/lib/tree-search";
import type { TreeGraphPerson } from "@/lib/tree";

const MAX_SUGGESTIONS = 6;

type Props = {
  people: TreeGraphPerson[];
  /** The chosen person's id, or null while still typing. */
  value: string | null;
  onChange: (personId: string | null) => void;
  placeholder: string;
  /** Names the field for a screen reader; the placeholder is only a hint. */
  label: string;
  /** Somebody who can't be picked here — the other end of the connection. */
  excludeId?: string | null;
};

/**
 * Pick one person off the tree by typing part of their name. Once chosen the
 * field becomes their name with a way to clear it, so a filled-in end of a
 * connection reads as a person rather than as search text.
 */
export function PersonPicker({
  people,
  value,
  onChange,
  placeholder,
  label,
  excludeId,
}: Props) {
  const [text, setText] = React.useState("");
  const chosen = value ? (people.find((p) => p.id === value) ?? null) : null;

  const suggestions = React.useMemo(
    () =>
      text.trim()
        ? people
            .filter((p) => p.id !== excludeId && matchesName(p, text))
            .sort((a, b) =>
              personDisplayName(a).localeCompare(personDisplayName(b)),
            )
        : [],
    [people, text, excludeId],
  );

  if (chosen) {
    return (
      <div className="flex h-8 items-center gap-2 rounded-lg border border-ring/50 bg-accent/40 pr-1.5 pl-2.5">
        <FitText max={14} min={11} className="min-w-0 flex-1 font-medium">
          {personDisplayName(chosen)}
        </FitText>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={`Clear ${personDisplayName(chosen)}`}
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  const pick = (personId: string) => {
    setText("");
    onChange(personId);
  };

  return (
    <div className="flex flex-col gap-1">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter takes the top suggestion, as it would in a search box.
          if (e.key === "Enter" && suggestions[0]) {
            e.preventDefault();
            pick(suggestions[0].id);
          }
        }}
        placeholder={placeholder}
        aria-label={label}
      />
      {text.trim() ? (
        suggestions.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {suggestions.slice(0, MAX_SUGGESTIONS).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => pick(p.id)}
                  className="w-full rounded-md px-2 py-1 text-left hover:bg-accent"
                >
                  <FitText max={13} min={11} className="leading-5 font-medium">
                    {personDisplayName(p)}
                  </FitText>
                  <FitText className="leading-4 text-muted-foreground">
                    {personLifespan(p) ?? "Living"}
                  </FitText>
                </button>
              </li>
            ))}
            {suggestions.length > MAX_SUGGESTIONS ? (
              <li className="px-2 text-xs text-muted-foreground">
                {suggestions.length - MAX_SUGGESTIONS} more — keep typing
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="px-2 text-xs text-muted-foreground">
            Nobody by that name on the tree.
          </p>
        )
      ) : null}
    </div>
  );
}
