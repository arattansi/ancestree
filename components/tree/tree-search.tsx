"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { personDisplayName, personLifespan } from "@/lib/person-name";
import {
  countryOptions,
  decadeOptions,
  isFilterActive,
  matchesFilter,
  type TreeFilter,
} from "@/lib/tree-search";
import type { TreeGraphPerson } from "@/lib/tree";

const ANY = "__any";

type Props = {
  people: TreeGraphPerson[];
  filter: TreeFilter;
  onFilterChange: (next: TreeFilter) => void;
  /** Select + centre the canvas on a result. */
  onPick: (personId: string) => void;
};

export function TreeSearch({ people, filter, onFilterChange, onPick }: Props) {
  const [open, setOpen] = React.useState(false);
  const countries = React.useMemo(() => countryOptions(people), [people]);
  const decades = React.useMemo(() => decadeOptions(people), [people]);

  const active = isFilterActive(filter);
  const results = React.useMemo(
    () =>
      active
        ? people
            .filter((p) => matchesFilter(p, filter))
            .sort((a, b) =>
              personDisplayName(a).localeCompare(personDisplayName(b)),
            )
        : [],
    [people, filter, active],
  );

  const set = (patch: Partial<TreeFilter>) =>
    onFilterChange({ ...filter, ...patch });

  const expanded = open || active;

  return (
    <div className="w-72 rounded-xl border border-border bg-card p-3 shadow-md">
      <div className="flex items-center gap-2">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={filter.text}
          onChange={(e) => set({ text: e.target.value })}
          onFocus={() => setOpen(true)}
          placeholder="Search people…"
          aria-label="Search people by name or place"
        />
        {active ? (
          <button
            type="button"
            onClick={() => {
              onFilterChange({
                text: "",
                country: "",
                birthDecade: "",
                living: "any",
              });
              setOpen(false);
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={filter.country || ANY}
              onValueChange={(v) =>
                set({ country: v === ANY ? "" : String(v) })
              }
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any country</SelectItem>
                {countries.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filter.birthDecade || ANY}
              onValueChange={(v) =>
                set({ birthDecade: v === ANY ? "" : String(v) })
              }
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder="Born" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any decade</SelectItem>
                {decades.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}s
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-1">
            {(["any", "living", "deceased"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set({ living: s })}
                className={
                  "flex-1 rounded-md border px-2 py-1 text-xs capitalize transition-colors " +
                  (filter.living === s
                    ? "border-ring bg-accent text-accent-foreground"
                    : "border-border text-muted-foreground hover:bg-accent/50")
                }
              >
                {s === "any" ? "Anyone" : s}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {active ? (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground">
            {results.length} {results.length === 1 ? "match" : "matches"}
          </p>
          <ul className="mt-1.5 flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            {results.map((p) => {
              const lifespan = personLifespan(p);
              const place =
                [p.city_of_birth, p.country_of_birth]
                  .filter(Boolean)
                  .join(", ") || null;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onPick(p.id)}
                    className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
                  >
                    <span className="block truncate text-sm font-medium">
                      {personDisplayName(p)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[lifespan, place].filter(Boolean).join(" · ") ||
                        "No other details"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {expanded && !active ? (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-3 text-xs text-muted-foreground underline underline-offset-2"
        >
          Close
        </button>
      ) : null}
    </div>
  );
}
