"use client";

import * as React from "react";
import { X } from "lucide-react";

import { placePeople } from "@/app/actions/trees";
import { PendingButton } from "@/components/pending-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import { useFocusReturn } from "@/components/use-focus-return";
import {
  carriedSummary,
  carryAskNote,
  carryCounts,
  lineOf,
  type CarryLine,
  type CarryPerson,
} from "@/lib/carry";
import { foldSearchText } from "@/lib/tree-search";

const MAX_SUGGESTIONS = 6;

function matches(person: CarryPerson, text: string): boolean {
  const needle = foldSearchText(text.trim());
  return !!needle && foldSearchText(person.name).includes(needle);
}

/**
 * Bringing people onto a tree from the Root's other trees (Step 80). Pick
 * someone and it lists everyone descended from them, ticked, partners
 * included unless that's switched off; with nobody picked, it's everyone
 * the Root can see, to tick one by one. Under each name, what bringing them
 * over asks: they arrive at once either way, whole or as a basic card.
 */
export function CarryPicker({
  treeId,
  people,
  lines,
  suggested = [],
}: {
  treeId: string;
  people: CarryPerson[];
  lines: CarryLine[];
  /** Ticked to begin with: the founder's close family, on their first run. */
  suggested?: string[];
}) {
  const ids = React.useId();
  const [ancestorId, setAncestorId] = React.useState<string | null>(null);
  const [partners, setPartners] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("");
  // With a line picked everyone in it is ticked but these; with none, only
  // these are.
  const [unticked, setUnticked] = React.useState<Set<string>>(new Set());
  const [ticked, setTicked] = React.useState<Set<string>>(new Set(suggested));
  const bring = useAction();
  const returnFocus = useFocusReturn();
  const searchRef = React.useRef<HTMLInputElement>(null);
  const clearRef = React.useRef<HTMLButtonElement>(null);

  const byId = React.useMemo(
    () => new Map(people.map((p) => [p.id, p])),
    [people],
  );
  const ancestor = ancestorId ? (byId.get(ancestorId) ?? null) : null;
  const candidates = React.useMemo(
    () => people.filter((p) => !p.here),
    [people],
  );

  const line = React.useMemo(
    () =>
      ancestor
        ? lineOf(ancestor.id, lines, { partners }).flatMap((id) => {
            const p = byId.get(id);
            return p ? [p] : [];
          })
        : null,
    [ancestor, lines, partners, byId],
  );
  // Of a line, only who isn't here yet can be brought.
  const listed = line
    ? line.filter((p) => !p.here)
    : filter.trim()
      ? candidates.filter((p) => matches(p, filter))
      : suggested.length > 0
        ? candidates.filter((p) => suggested.includes(p.id) || ticked.has(p.id))
        : candidates;
  const isTicked = (id: string) => (line ? !unticked.has(id) : ticked.has(id));
  const picked = line
    ? listed.filter((p) => !unticked.has(p.id))
    : candidates.filter((p) => ticked.has(p.id));
  const counts = carryCounts(picked);
  const basic = counts.owner + counts.stewards;
  const alreadyHere = line ? line.length - listed.length : 0;

  const suggestions = search.trim()
    ? people.filter((p) => matches(p, search))
    : [];

  function toggle(id: string, on: boolean) {
    const set = line ? setUnticked : setTicked;
    // Ticking adds to the ticked, and takes from the unticked.
    const add = line ? !on : on;
    set((prev) => {
      const next = new Set(prev);
      if (add) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function pick(id: string) {
    setSearch("");
    setUnticked(new Set());
    returnFocus(() => clearRef.current);
    setAncestorId(id);
  }

  function onBring() {
    if (picked.length === 0) return;
    bring.run(
      "bring",
      () =>
        placePeople(
          treeId,
          picked.map((p) => p.id),
        ),
      {
        success: (res) => carriedSummary(res.placed ?? []),
        onSuccess: () => {
          setAncestorId(null);
          setUnticked(new Set());
          setTicked(new Set());
          setFilter("");
        },
      },
    );
  }

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nobody to bring over.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-of`}>All descendants of</Label>
        {ancestor ? (
          <div className="flex h-8 items-center gap-2 rounded-lg border border-ring/50 bg-accent/40 pr-1.5 pl-2.5 text-sm">
            <span id={`${ids}-of`} className="min-w-0 flex-1 truncate font-medium">
              {ancestor.name}
            </span>
            <button
              ref={clearRef}
              type="button"
              onClick={() => {
                returnFocus(() => searchRef.current);
                setAncestorId(null);
                setUnticked(new Set());
              }}
              className="relative tap-target text-muted-foreground hover:text-foreground"
              aria-label={`Clear ${ancestor.name}`}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <>
            <Input
              id={`${ids}-of`}
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                // Enter takes the top suggestion, as it would in a search box.
                if (e.key === "Enter" && suggestions[0]) {
                  e.preventDefault();
                  pick(suggestions[0].id);
                }
              }}
              placeholder="Pick a person…"
              autoComplete="off"
            />
            {search.trim() ? (
              suggestions.length > 0 ? (
                <ul className="flex flex-col gap-0.5">
                  {suggestions.slice(0, MAX_SUGGESTIONS).map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => pick(p.id)}
                        className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-accent"
                      >
                        <span className="block truncate font-medium">{p.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[p.lifespan, p.fromTrees.join(", ")]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
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
                  Nobody by that name on your other trees.
                </p>
              )
            ) : null}
          </>
        )}
      </div>

      {ancestor ? (
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${ids}-partners`}
            checked={partners}
            onCheckedChange={(on) => setPartners(on === true)}
          />
          <Label htmlFor={`${ids}-partners`} className="font-normal">
            And their partners
          </Label>
        </div>
      ) : (
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Or find someone by name"
          aria-label="Find someone by name"
          autoComplete="off"
        />
      )}

      <ul
        aria-label={ancestor ? `Descendants of ${ancestor.name}` : "People on your other trees"}
        className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border"
      >
        {listed.map((p) => {
          const id = `${ids}-${p.id}`;
          return (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <Checkbox
                id={id}
                checked={isTicked(p.id)}
                onCheckedChange={(on) => toggle(p.id, on === true)}
              />
              <label htmlFor={id} className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">
                  {p.name}
                  {p.lifespan ? (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      {p.lifespan}
                    </span>
                  ) : null}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {carryAskNote(p.asks)}
                  {p.fromTrees.length > 0 ? ` · ${p.fromTrees.join(", ")}` : ""}
                </span>
              </label>
            </li>
          );
        })}
        {listed.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">
            {ancestor ? "All of them are here already." : "Nobody by that name."}
          </li>
        ) : null}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {picked.length === 0
            ? alreadyHere > 0 && listed.length > 0
              ? `${alreadyHere} here already`
              : ""
            : [
                counts.full > 0 ? `${counts.full} in full` : null,
                basic > 0 ? `${basic} basic until approved` : null,
                alreadyHere > 0 ? `${alreadyHere} here already` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
        </p>
        <PendingButton
          size="sm"
          onClick={onBring}
          pending={bring.pending}
          pendingLabel="bringing…"
          disabled={picked.length === 0}
        >
          {picked.length === 0 ? "bring over" : `bring ${picked.length} over`}
        </PendingButton>
      </div>
    </div>
  );
}
