"use client";

import * as React from "react";
import {
  ChevronDown,
  ListFilter,
  PawPrint,
  Route,
  Search,
  SlidersHorizontal,
  TreeDeciduous,
  X,
} from "lucide-react";

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
  /**
   * "Show only your Root's side" (Step 48): on or off, or `null` when the
   * viewer has no side that leaves anyone out, so there's nothing to offer.
   */
  sideOnly: boolean | null;
  onSideOnlyChange: (on: boolean) => void;
  /** The viewer is a Root, so the side is their own. */
  ownSide: boolean;
};

type SectionKey = "find" | "connection" | "filters";

/**
 * One of the card's sections, closed until it's opened (Step 48). A dot on
 * its heading says something in it is changing the canvas, so a closed
 * section still owns up to what the tree is showing.
 */
function Section({
  icon,
  title,
  on,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  on: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-3">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full items-center gap-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground aria-expanded:text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0"
        >
          {icon}
          {title}
          {on ? (
            <span className="size-1.5 rounded-full bg-primary">
              <span className="sr-only">, on</span>
            </span>
          ) : null}
          <ChevronDown
            aria-hidden
            className={cn(
              "ml-auto text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </h3>
      {open ? children : null}
    </section>
  );
}

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
    >
      Clear
    </button>
  );
}

/** A labelled on/off switch, one row of the Filters section. */
function SwitchRow({
  icon,
  label,
  on,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="group/switch flex w-full items-center justify-between gap-3 text-left text-xs"
    >
      <span className="flex items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
        {icon}
        {label}
      </span>
      <span
        aria-hidden
        className={cn(
          "flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent p-0.5 transition-colors group-focus-visible/switch:ring-3 group-focus-visible/switch:ring-ring/50",
          on ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "size-4 rounded-full bg-background shadow-sm transition-transform",
            on && "translate-x-4",
          )}
        />
      </span>
    </button>
  );
}

/**
 * Everything that changes what the canvas shows, behind one button: finding
 * a person, lighting the connection between two people, and the filters —
 * only the viewer's Root's side, and whether pets and companions are drawn at
 * all (they are off until switched on here). Each section stays closed until
 * it's opened. Closed, the button counts what is switched on, so a canvas
 * that differs from the plain tree always says why.
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
  sideOnly,
  onSideOnlyChange,
  ownSide,
}: Props) {
  const [open, setOpen] = React.useState(false);
  // Which sections are open, kept while the card closes and opens again.
  const [expanded, setExpanded] = React.useState<ReadonlySet<SectionKey>>(
    () => new Set(),
  );
  const toggle = (key: SectionKey) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (!next.delete(key)) next.add(key);
      return next;
    });
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
  const lit = connecting && !connectionMissing;
  const switchedOn =
    Number(active) + Number(lit) + Number(showCompanions) + Number(!!sideOnly);

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
    <div className="relative z-10 flex max-h-[calc(100dvh-9rem)] w-[calc(100vw-2rem)] max-w-72 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-md sm:w-72">
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

      <Section
        icon={<Search />}
        title="Find a person"
        on={active}
        open={expanded.has("find")}
        onToggle={() => toggle("find")}
      >
        <Input
          value={filter.text}
          onChange={(e) => set({ text: e.target.value })}
          placeholder="Name or place…"
          aria-label="Search people by name or place"
          // Opening the section is asking to search.
          autoFocus
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
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {results.length} {results.length === 1 ? "match" : "matches"}
              </p>
              <ClearButton onClick={() => onFilterChange(EMPTY_FILTER)} />
            </div>
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
      </Section>

      <Section
        icon={<Route />}
        title="Show a connection"
        on={lit}
        open={expanded.has("connection")}
        onToggle={() => toggle("connection")}
      >
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
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {connectionMissing
              ? "Nothing on the tree joins these two yet."
              : connecting
                ? "Their connection is lit on the tree."
                : "Pick two people to light the line between them."}
          </p>
          {connection.from || connection.to ? (
            <ClearButton onClick={() => onConnectionChange(NO_CONNECTION)} />
          ) : null}
        </div>
      </Section>

      <Section
        icon={<ListFilter />}
        title="Filters"
        on={showCompanions || !!sideOnly}
        open={expanded.has("filters")}
        onToggle={() => toggle("filters")}
      >
        {sideOnly !== null ? (
          <SwitchRow
            icon={<TreeDeciduous />}
            label={ownSide ? "Show only your side" : "Show only your Root’s side"}
            on={sideOnly}
            onChange={onSideOnlyChange}
          />
        ) : null}
        <SwitchRow
          icon={<PawPrint />}
          label="Pets & companions"
          on={showCompanions}
          onChange={onShowCompanionsChange}
        />
      </Section>
    </div>
  );
}
