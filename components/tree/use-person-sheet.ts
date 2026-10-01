"use client";

import * as React from "react";

import {
  personSheetHref,
  type PersonSheet,
  type PersonSheetAnswer,
  type SheetSection,
} from "@/lib/person-sheet";

/**
 * The details sheet's reads (Step 87.6, audit S6): one GET per opening for
 * whatever it lacks (`/api/person-sheet`), called off when the reader moves
 * on to someone else, and kept per person for the tab, as the ancestral
 * lands are. The sheet's sections read their person's entry here, and write
 * their own changes to it, so coming back to someone shows what was done.
 */
export type PersonSheetEntry = {
  sheet: PersonSheet;
  /** Sections the last read couldn't get. */
  failed: readonly SheetSection[];
  /** Bumped to read again (`invalidatePersonSheet`). */
  retries: number;
};

/** What an open sheet shows, so reads. */
export type SheetWant = {
  trees: boolean;
  album: boolean;
  stories: boolean;
  /** The open reports the canvas counts for the viewer; none, none read. */
  reports: number;
  /** A placeholder's held-back details, for its parent or the child (98.3). */
  heldBack?: boolean;
};

/**
 * How long a section read stays good for reopening someone without asking
 * again: long enough for clicking back and forth between relatives. A new
 * page from the server (any save that redraws it) ends it sooner.
 */
const FRESH_MS = 60_000;

const entries = new Map<string, PersonSheetEntry>();
/** When each section was read, and the report count it was read at. */
const readAt = new Map<string, Partial<Record<SheetSection, number>>>();
const reportCountAt = new Map<string, number>();
/**
 * When each section was last changed here, in the order of `step`: an
 * answer to a read sent before then doesn't overwrite it.
 */
const changedAt = new Map<string, Partial<Record<SheetSection, number>>>();
let step = 0;
/** The read on its way for a person, to call off. */
const inflight = new Map<string, AbortController>();
const listeners = new Set<() => void>();

const EMPTY: PersonSheetEntry = { sheet: {}, failed: [], retries: 0 };

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function write(
  personId: string,
  change: (entry: PersonSheetEntry) => PersonSheetEntry,
): void {
  entries.set(personId, change(entries.get(personId) ?? EMPTY));
  for (const listener of listeners) listener();
}

/** The sections `want` asks for that aren't here, or not freshly. */
function missing(personId: string, want: SheetWant, now: number): SheetSection[] {
  const have = entries.get(personId)?.sheet ?? {};
  const at = readAt.get(personId) ?? {};
  const fresh = (s: SheetSection) =>
    have[s] !== undefined && now - (at[s] ?? 0) < FRESH_MS;
  const need: SheetSection[] = [];
  if (want.trees && !fresh("trees")) need.push("trees");
  if (
    want.reports > 0 &&
    (!fresh("reports") || reportCountAt.get(personId) !== want.reports)
  ) {
    need.push("reports");
  }
  if (want.album && !fresh("album")) need.push("album");
  if (want.stories && !fresh("stories")) need.push("stories");
  if (want.heldBack && !fresh("heldBack")) need.push("heldBack");
  return need;
}

/** A person's reads, as they arrive; null until the first. */
export function usePersonSheet(personId: string): PersonSheetEntry | null {
  return React.useSyncExternalStore(
    subscribe,
    () => entries.get(personId) ?? null,
    () => null,
  );
}

/**
 * Read what the open sheet shows about `personId` and doesn't have yet, in
 * one request; null (closed, or minimized) reads nothing. Moving to someone
 * else calls off a read still on its way.
 */
export function useLoadPersonSheet(
  personId: string | null,
  { trees, album, stories, reports, heldBack = false }: SheetWant,
): void {
  const retries = React.useSyncExternalStore(
    subscribe,
    () => (personId ? (entries.get(personId)?.retries ?? 0) : 0),
    () => 0,
  );

  React.useEffect(() => {
    if (!personId) return;
    const want = { trees, album, stories, reports, heldBack };
    const need = missing(personId, want, Date.now());
    if (need.length === 0) return;

    inflight.get(personId)?.abort();
    const sent = ++step;
    const controller = new AbortController();
    inflight.set(personId, controller);
    fetch(personSheetHref(personId, need), {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as PersonSheetAnswer;
      })
      .then(
        ({ sheet, failed }) => {
          const now = Date.now();
          const at = { ...readAt.get(personId) };
          for (const s of need) if (!failed.includes(s)) at[s] = now;
          readAt.set(personId, at);
          if (need.includes("reports")) reportCountAt.set(personId, reports);
          // What was changed here while it was on its way stays.
          const changed = changedAt.get(personId) ?? {};
          const kept = Object.fromEntries(
            Object.entries(sheet).filter(
              ([s]) => (changed[s as SheetSection] ?? 0) < sent,
            ),
          );
          write(personId, (e) => ({ ...e, sheet: { ...e.sheet, ...kept }, failed }));
        },
        () => {
          // Called off: nobody is waiting for it. Out of reach: every
          // section asked for says so.
          if (controller.signal.aborted) return;
          write(personId, (e) => ({ ...e, failed: need }));
        },
      )
      .finally(() => {
        if (inflight.get(personId) === controller) inflight.delete(personId);
      });

    return () => {
      if (inflight.get(personId) !== controller) return;
      controller.abort();
      inflight.delete(personId);
    };
  }, [personId, trees, album, stories, reports, heldBack, retries]);
}

/**
 * A section changed here (a story told, a photo added, a report dealt
 * with): the sheet
 * shows it at once, and keeps it. `change` is handed what's here, if
 * anything; given nothing back, the section is left as it is.
 */
export function setPersonSheet<S extends SheetSection>(
  personId: string,
  section: S,
  change: (current: PersonSheet[S]) => PersonSheet[S],
): void {
  const next = change(entries.get(personId)?.sheet[section]);
  if (next === undefined) return;
  changedAt.set(personId, { ...changedAt.get(personId), [section]: ++step });
  write(personId, (e) => ({ ...e, sheet: { ...e.sheet, [section]: next } }));
}

/**
 * Read a person's sections again (all, or those named): at once if their
 * sheet is open, else when it next opens.
 */
export function invalidatePersonSheet(
  personId: string,
  sections?: readonly SheetSection[],
): void {
  const at = { ...readAt.get(personId) };
  for (const s of sections ?? Object.keys(at)) delete at[s as SheetSection];
  readAt.set(personId, at);
  write(personId, (e) => ({ ...e, failed: [], retries: e.retries + 1 }));
}

/**
 * The server drew the page again (a save, or coming back to it): whatever
 * the sheet holds may be out of date, so each person's is read again when
 * they're next opened. An open sheet keeps what it shows.
 */
export function markPersonSheetsStale(): void {
  readAt.clear();
}
