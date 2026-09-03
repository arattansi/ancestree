"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CompanionOption = { id: string; label: string };

/**
 * Pick the people a companion belongs to.
 *
 * Multi-select by design: a household pet belongs to everyone who lived with
 * it, and forcing a single "owner" is what would make it read as a child of
 * one person. Already-picked people show as removable chips.
 */
export function CompanionPicker({
  options,
  value,
  onChange,
  disabled = false,
  /** People that can't be unpicked here — e.g. the entry you started from. */
  locked = [],
  label = "Belongs to",
}: {
  options: CompanionOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  locked?: string[];
  label?: string;
}) {
  const [query, setQuery] = React.useState("");
  const labelById = React.useMemo(
    () => new Map(options.map((o) => [o.id, o.label])),
    [options],
  );

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const unpicked = options.filter((o) => !value.includes(o.id));
    if (!q) return unpicked.slice(0, 8);
    return unpicked
      .filter((o) => o.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [options, value, query]);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <li
              key={id}
              className="flex items-center gap-1 rounded-full border border-border bg-muted/50 py-1 pr-1 pl-2.5 text-xs"
            >
              <span>{labelById.get(id) ?? "Someone on the tree"}</span>
              {locked.includes(id) ? null : (
                <button
                  type="button"
                  disabled={disabled}
                  className="rounded-full px-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  onClick={() => onChange(value.filter((v) => v !== id))}
                  aria-label={`Remove ${labelById.get(id) ?? "this person"}`}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Pick at least one person.
        </p>
      )}

      <Input
        type="search"
        placeholder="Add someone else on the tree…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled}
      />

      {matches.length > 0 ? (
        <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {matches.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                disabled={disabled}
                className={cn(
                  "w-full px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:bg-accent focus-visible:outline-none",
                )}
                onClick={() => {
                  onChange([...value, o.id]);
                  setQuery("");
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
