"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { useFocusReturn } from "@/components/use-focus-return";
import { foldSearchText } from "@/lib/tree-search";
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
  const returnFocus = useFocusReturn();
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Focus stays in the picker as its buttons go (Step 70): a chip's ✕ hands
  // it on to the next chip's ✕, or to the search box after the last; a name
  // picked from the list, to the box. Where the change waits on the server,
  // the picker is disabled meanwhile, and focus waits for that too.
  function handOn(gone: Element, next: HTMLButtonElement | null) {
    returnFocus(() => {
      if (gone.isConnected) return null;
      const target = next?.isConnected ? next : inputRef.current;
      return target && !target.disabled ? target : null;
    });
  }

  const matches = React.useMemo(() => {
    const q = foldSearchText(query.trim());
    const unpicked = options.filter((o) => !value.includes(o.id));
    if (!q) return unpicked.slice(0, 8);
    return unpicked
      .filter((o) => foldSearchText(o.label).includes(q))
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
                  className="relative tap-target rounded-full px-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  onClick={(event) => {
                    const chip = event.currentTarget.closest("li");
                    if (chip) {
                      handOn(
                        chip,
                        chip.nextElementSibling?.querySelector("button") ??
                          null,
                      );
                    }
                    onChange(value.filter((v) => v !== id));
                  }}
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
        ref={inputRef}
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
                onClick={(event) => {
                  handOn(event.currentTarget, null);
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
