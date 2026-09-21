"use client";

import * as React from "react";
import { PawPrint, Route, Search, SlidersHorizontal, X } from "lucide-react";

import { PersonPicker } from "@/components/tree/person-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FitText } from "@/components/ui/fit-text";
import { personDisplayName, personLifespan } from "@/lib/person-name";
import {
  countryOptions,
  decadeOptions,
  EMPTY_FILTER,
  isFilterActive,
  matchesFilter,
  type TreeFilter,
} from "@/lib/tree-search";
import type { TreeGraphPerson } from "@/lib/tree";

const ANY = "__any";

/** The two ends of a connection, either of which may still be unpicked. */
export type ConnectionEnds = { from: string | null; to: string | null };

export const NO_CONNECTION: ConnectionEnds = { from: null, to: null };

type Props = {
  people: TreeGraphPerson[];
  filter: TreeFilter;
  onFilterChange: (next: TreeFilter) => void;
  /** Select + centre the canvas on a result. */
  onPick: (personId: string) => void;
  connection: ConnectionEnds;
  /** Answers whether the two ends now have a connection lit between them. */
  onConnectionChange: (next: ConnectionEnds) => boolean;
  /** Both ends are picked but no chain of relationships joins them. */
  connectionMissing: boolean;
  showCompanions: boolean;
  onShowCompanionsChange: (shown: boolean) => void;
};

function SectionHeading({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
      {icon}
      {children}
    </h3>
  );
}

/**
 * Everything that changes what the canvas shows, behind one button: finding
 * people, lighting the connection between two of them, and whether pets and
 * companions are drawn at all — they are off until switched on here. Closed,
 * the button counts what is switched on, so a canvas that differs from the
 * plain tree always says why.
 */
export function TreeSearch({
  people,
  filter,
  onFilterChange,
  onPick,
  connection,
  onConnectionChange,
  connectionMissing,
  showCompanions,
  onShowCompanionsChange,
}: Props) {
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

  // Once the card has done its job — somebody opened, a connection lit — it
  // gets out of the way of what it just put on the canvas. The button's count
  // still says what is switched on.
  const connect = (next: ConnectionEnds) => {
    if (onConnectionChange(next)) setOpen(false);
  };

  const connecting = !!connection.from && !!connection.to;
  const switchedOn =
    Number(active) +
    Number(connecting && !connectionMissing) +
    Number(showCompanions);

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-1.5 bg-card shadow-md"
        aria-label="Search and filters"
        aria-expanded={false}
      >
        <SlidersHorizontal />
        <span className="hidden sm:inline">Search &amp; filters</span>
        {switchedOn > 0 ? (
          <span
            className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] leading-none font-semibold text-primary-foreground"
            aria-label={`${switchedOn} switched on`}
          >
            {switchedOn}
          </span>
        ) : null}
      </Button>
    );
  }

  return (
    <div className="relative z-10 flex max-h-[calc(100dvh-9rem)] w-[calc(100vw-2rem)] max-w-72 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-md sm:w-72">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <SlidersHorizontal className="size-3.5 text-muted-foreground" />
          Search &amp; filters
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close search and filters"
        >
          <X className="size-4" />
        </button>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionHeading icon={<Search />}>Find people</SectionHeading>
          {active ? (
            <button
              type="button"
              onClick={() => onFilterChange(EMPTY_FILTER)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Clear
            </button>
          ) : null}
        </div>
        <Input
          value={filter.text}
          onChange={(e) => set({ text: e.target.value })}
          placeholder="Name or place…"
          aria-label="Search people by name or place"
        />
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={filter.country || ANY}
            onValueChange={(v) => set({ country: v === ANY ? "" : String(v) })}
          >
            <SelectTrigger className="w-full" size="sm">
              <SelectValue className="min-w-0">
                {(v: string) => (
                  <FitText>{v === ANY ? "Place of Birth" : v}</FitText>
                )}
              </SelectValue>
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
              <SelectValue className="min-w-0">
                {(v: string) => (
                  <FitText>{v === ANY ? "Year of Birth" : `${v}s`}</FitText>
                )}
              </SelectValue>
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

        {active ? (
          <div>
            <p className="text-xs text-muted-foreground">
              {results.length} {results.length === 1 ? "match" : "matches"}
            </p>
            <ul className="mt-1.5 flex max-h-48 flex-col gap-0.5 overflow-y-auto">
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
                      onClick={() => {
                        onPick(p.id);
                        setOpen(false);
                      }}
                      className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
                    >
                      <FitText
                        max={14}
                        min={11}
                        className="leading-5 font-medium"
                      >
                        {personDisplayName(p)}
                      </FitText>
                      <FitText className="leading-4 text-muted-foreground">
                        {[lifespan, place].filter(Boolean).join(" · ") ||
                          "No other details"}
                      </FitText>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <SectionHeading icon={<Route />}>Show a connection</SectionHeading>
          {connection.from || connection.to ? (
            <button
              type="button"
              onClick={() => onConnectionChange(NO_CONNECTION)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Clear
            </button>
          ) : null}
        </div>
        <PersonPicker
          people={people}
          value={connection.from}
          onChange={(from) => connect({ ...connection, from })}
          excludeId={connection.to}
          placeholder="First person…"
          label="First person of the connection"
        />
        <PersonPicker
          people={people}
          value={connection.to}
          onChange={(to) => connect({ ...connection, to })}
          excludeId={connection.from}
          placeholder="Second person…"
          label="Second person of the connection"
        />
        <p className="text-xs text-muted-foreground">
          {connectionMissing
            ? "Nothing on the tree joins these two yet."
            : connecting
              ? "Their connection is lit on the tree."
              : "Pick two people to light the line between them."}
        </p>
      </section>

      <section className="border-t border-border pt-3">
        <button
          type="button"
          role="switch"
          aria-checked={showCompanions}
          onClick={() => onShowCompanionsChange(!showCompanions)}
          className="group/switch flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="flex flex-col gap-0.5">
            <SectionHeading icon={<PawPrint />}>
              Pets &amp; companions
            </SectionHeading>
            <span className="text-xs text-muted-foreground/80">
              {showCompanions ? "Shown on the tree." : "Hidden from the tree."}{" "}
              Stays this way until you change it.
            </span>
          </span>
          <span
            aria-hidden
            className={cn(
              "flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent p-0.5 transition-colors group-focus-visible/switch:ring-3 group-focus-visible/switch:ring-ring/50",
              showCompanions ? "bg-primary" : "bg-input",
            )}
          >
            <span
              className={cn(
                "size-4 rounded-full bg-background shadow-sm transition-transform",
                showCompanions && "translate-x-4",
              )}
            />
          </span>
        </button>
      </section>
    </div>
  );
}
