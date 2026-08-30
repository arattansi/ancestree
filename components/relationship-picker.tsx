"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type TreeMemberOption = { id: string; label: string };

/**
 * Search-select for choosing an existing tree member to connect a new entry to.
 */
export function RelationshipPicker({
  members,
  value,
  onChange,
  disabled,
  labelId,
}: {
  members: TreeMemberOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  labelId?: string;
}) {
  const [query, setQuery] = React.useState("");
  const selected = members.find((m) => m.id === value) ?? null;

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.label.toLowerCase().includes(q));
  }, [members, query]);

  return (
    <div className="flex flex-col gap-2">
      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <span>
            Connecting to <strong className="font-medium">{selected.label}</strong>
          </span>
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => {
              onChange("");
              setQuery("");
            }}
            disabled={disabled}
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <Input
            type="search"
            placeholder="Search people already in the tree…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={disabled}
            aria-labelledby={labelId}
            aria-controls="relationship-picker-list"
          />
          <ul
            id="relationship-picker-list"
            role="listbox"
            aria-labelledby={labelId}
            className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border"
          >
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                No matches.
              </li>
            ) : (
              matches.map((m) => (
                <li key={m.id} role="option" aria-selected={m.id === value}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange(m.id);
                      setQuery("");
                    }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                      "focus-visible:bg-accent focus-visible:outline-none",
                    )}
                  >
                    {m.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </div>
  );
}
