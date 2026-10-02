"use client";

import * as React from "react";
import {
  ChevronDown,
  ListFilter,
  ListTree,
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
import { useFocusReturn } from "@/components/use-focus-return";
import { countOf } from "@/lib/plural";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FitText } from "@/components/ui/fit-text";
import {
  maidenLine,
  personDisplayName,
  personLifespan,
} from "@/lib/person-name";
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

/** As many results as the connection pickers offer (`PersonPicker`). */
const MAX_RESULTS = 6;

/** The two ends of a connection, either of which may still be unpicked. */
export type ConnectionEnds = { from: string | null; to: string | null };

export const NO_CONNECTION: ConnectionEnds = { from: null, to: null };

type Props = {
  /** The card is open, rather than folded to its button. The canvas holds
   *  this so opening **Upcoming** can close it (Step 57.1). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  /**
   * "Only descendants of" (Step 57.2): the one or two people picked, and
   * whom the pickers offer — the tree, or the Root's side while that's on.
   */
  descendantsOf: string[];
  onDescendantsOfChange: (ids: string[]) => void;
  descendantChoices: TreeGraphPerson[];
  /**
   * The width from which the button's words show; below it, just the symbol.
   * `lg` beside the details sheet, as for **Add a relative** above it.
   */
  labelFrom?: "sm" | "lg";
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

/**
 * The first few people a search finds, each a way to open them. Only a
 * finished search draws it again, not each key while one is being typed
 * (Step 87.2, audit C4).
 */
const SearchResults = React.memo(function SearchResults({
  results,
  onPick,
}: {
  results: TreeGraphPerson[];
  onPick: (personId: string) => void;
}) {
  const rest = results.length - MAX_RESULTS;
  return (
    <>
      <ul className="mt-1.5 flex max-h-48 flex-col gap-0.5 overflow-y-auto">
        {results.slice(0, MAX_RESULTS).map((p) => {
          const lifespan = personLifespan(p);
          // Under the name, as on the card: a search for a maiden
          // name finds someone under their married one.
          const maiden = maidenLine(p);
          const place =
            [p.city_of_birth, p.country_of_birth].filter(Boolean).join(", ") ||
            null;
          const details =
            [lifespan, place].filter(Boolean).join(" · ") ||
            (maiden ? null : "No other details");
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p.id)}
                className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
              >
                <span className="block truncate text-sm leading-5 font-medium">
                  {personDisplayName(p)}
                </span>
                {maiden ? (
                  <span className="block truncate text-xs leading-4 text-muted-foreground">
                    {maiden}
                  </span>
                ) : null}
                {details ? (
                  <span className="block truncate text-xs leading-4 text-muted-foreground">
                    {details}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {rest > 0 ? (
        <p className="mt-1 px-2 text-xs text-muted-foreground">
          and {rest} more
        </p>
      ) : null}
    </>
  );
});

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
 * only the viewer's Root's side, only the descendants of one or two people,
 * and whether pets and companions are drawn at all (they are off until
 * switched on here). Each section stays closed until it's opened. Closed, the
 * button counts what is switched on, so a canvas that differs from the plain
 * tree always says why.
 */
export function TreeSearch({
  open,
  onOpenChange: setOpen,
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
  descendantsOf,
  onDescendantsOfChange,
  descendantChoices,
  labelFrom = "sm",
}: Props) {
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
  // The box shows each key at once; what it finds follows when there's time,
  // as the canvas's dimming does (Step 87.2).
  const shownFilter = React.useDeferredValue(filter);
  const shownActive = isFilterActive(shownFilter);
  const results = React.useMemo(
    () =>
      shownActive
        ? people
            .filter((p) => matchesFilter(p, shownFilter))
            .sort((a, b) =>
              personDisplayName(a).localeCompare(personDisplayName(b)),
            )
        : [],
    [people, shownFilter, shownActive],
  );
  const pickResult = React.useCallback(
    (personId: string) => {
      onPick(personId);
      setOpen(false);
    },
    [onPick, setOpen],
  );

  const set = (patch: Partial<TreeFilter>) =>
    onFilterChange({ ...filter, ...patch });

  // The button and the card take each other's place, so focus is handed
  // across (Step 70): to the card's ✕ as it opens (or to the find box, which
  // takes it itself when its section is open), and back to the button as the
  // card closes itself. Clear hands it to the box it emptied.
  const returnFocus = useFocusReturn();
  const openRef = React.useRef<HTMLButtonElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const findRef = React.useRef<HTMLInputElement>(null);
  const fromRef = React.useRef<HTMLInputElement>(null);
  const descendantRef = React.useRef<HTMLInputElement>(null);
  const openCard = () => {
    returnFocus(() => closeRef.current);
    setOpen(true);
  };
  const closeCard = () => {
    returnFocus(() => openRef.current);
    setOpen(false);
  };

  // Once the card has done its job — somebody opened, a connection lit — it
  // gets out of the way of what it just put on the canvas. The button's count
  // still says what is switched on.
  const connect = (next: ConnectionEnds) => {
    if (onConnectionChange(next)) closeCard();
  };

  const connecting = !!connection.from && !!connection.to;
  const lit = connecting && !connectionMissing;
  const descending = descendantsOf.length > 0;
  const switchedOn =
    Number(active) +
    Number(lit) +
    Number(showCompanions) +
    Number(!!sideOnly) +
    Number(descending);

  if (!open) {
    return (
      <Button
        ref={openRef}
        size="sm"
        variant="outline"
        onClick={openCard}
        className="gap-1.5 bg-card shadow-md"
        aria-label="Search and filters"
        aria-expanded={false}
      >
        <SlidersHorizontal />
        <span
          className={
            labelFrom === "lg" ? "hidden lg:inline" : "hidden sm:inline"
          }
        >
          search &amp; filters
        </span>
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
    // On a touch screen the ✕'s hit area reaches past the card's padding; it
    // mustn't make the card scroll sideways.
    <div className="relative z-10 flex max-h-[calc(100dvh-9rem)] w-[calc(100vw-2rem)] max-w-72 flex-col gap-3 overflow-x-hidden overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-md sm:w-72">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <SlidersHorizontal className="size-3.5 text-muted-foreground" />
          Search &amp; filters
        </h2>
        <button
          ref={closeRef}
          type="button"
          onClick={closeCard}
          className="relative tap-target text-muted-foreground hover:text-foreground"
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
          ref={findRef}
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
                "flex-1 rounded-md border px-2 py-1 text-xs transition-colors " +
                (filter.living === s
                  ? "border-ring bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground hover:bg-accent/50")
              }
            >
              {s === "any" ? "anyone" : s}
            </button>
          ))}
        </div>

        {shownActive ? (
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {countOf(results.length, "match", "matches")}
              </p>
              <ClearButton
                onClick={() => {
                  returnFocus(() => findRef.current);
                  onFilterChange(EMPTY_FILTER);
                }}
              />
            </div>
            <SearchResults results={results} onPick={pickResult} />
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
          inputRef={fromRef}
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
            <ClearButton
              onClick={() => {
                returnFocus(() => fromRef.current);
                onConnectionChange(NO_CONNECTION);
              }}
            />
          ) : null}
        </div>
      </Section>

      <Section
        icon={<ListFilter />}
        title="Filters"
        on={showCompanions || !!sideOnly || descending}
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
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
              <ListTree />
              Only descendants of
            </span>
            {descending ? (
              <ClearButton
                onClick={() => {
                  returnFocus(() => descendantRef.current);
                  onDescendantsOfChange([]);
                }}
              />
            ) : null}
          </div>
          <PersonPicker
            people={descendantChoices}
            value={descendantsOf[0] ?? null}
            onChange={(id) =>
              onDescendantsOfChange(
                id ? [id, ...descendantsOf.slice(1)] : descendantsOf.slice(1),
              )
            }
            excludeId={descendantsOf[1]}
            placeholder="Pick a person…"
            label="Only the descendants of"
            inputRef={descendantRef}
          />
          {descending ? (
            <PersonPicker
              people={descendantChoices}
              value={descendantsOf[1] ?? null}
              onChange={(id) =>
                onDescendantsOfChange(
                  id ? [descendantsOf[0], id] : [descendantsOf[0]],
                )
              }
              excludeId={descendantsOf[0]}
              placeholder="And another…"
              label="And the descendants of"
            />
          ) : null}
        </div>
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
