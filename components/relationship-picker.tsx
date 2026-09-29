"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { foldSearchText } from "@/lib/tree-search";
import { cn } from "@/lib/utils";

export type TreeMemberOption = {
  id: string;
  label: string;
  /** Maiden name, when set — also matched by the search box. */
  maidenName?: string | null;
  /**
   * This member's parents already on the tree. Used by the add-person flow to
   * offer "also link the new sibling to these parents" so they render together.
   */
  parents?: { id: string; label: string }[];
  /**
   * This member's partners. Used to offer a second parent whenever someone is
   * connected as this member's child — the write path records one parent edge
   * at a time, so without the offer half the parentage goes missing.
   */
  partners?: { id: string; label: string; isDivorced: boolean }[];
};

/**
 * Search-select for choosing an existing tree member to connect a new entry to.
 */
export function RelationshipPicker({
  members,
  value,
  onChange,
  labelId,
}: {
  members: TreeMemberOption[];
  value: string;
  onChange: (id: string) => void;
  labelId?: string;
}) {
  const [query, setQuery] = React.useState("");
  // Its own id, since a form can hold more than one picker (Step 61).
  const listId = React.useId();
  const selected = members.find((m) => m.id === value) ?? null;

  const matches = React.useMemo(() => {
    const q = foldSearchText(query.trim());
    if (!q) return members;
    return members.filter((m) =>
      foldSearchText(`${m.label} ${m.maidenName ?? ""}`).includes(q),
    );
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
            aria-labelledby={labelId}
            aria-controls={listId}
          />
          <ul
            id={listId}
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
                    {m.maidenName ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · née {m.maidenName}
                      </span>
                    ) : null}
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
