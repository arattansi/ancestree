import type { AlbumPhoto } from "@/lib/album";
import type { EntryReport } from "@/lib/entry-reports";
import type { HeldBackDetails } from "@/lib/held-back";
import type { EntryStory } from "@/lib/stories";

/**
 * What the person details sheet reads when it opens (Step 87.6, audit S6),
 * in one GET (`/api/person-sheet`) rather than a server action each: the
 * client sends actions one at a time, so four reads went in single file
 * and waited behind any save, a card drop included, and couldn't be called
 * off when the reader moved on to someone else.
 */
export const SHEET_SECTIONS = [
  "trees",
  "reports",
  "album",
  "stories",
  "heldBack",
] as const;
export type SheetSection = (typeof SHEET_SECTIONS)[number];

/** Another tree the person is shown on that the viewer may open. */
export type PersonTreeLink = {
  id: string;
  name: string;
  slug: string;
  /** Opened to the viewer's own tree (27.9), not theirs. */
  visitor: boolean;
};

export type PersonSheet = {
  /** "Also on" (Step 25), the tree it was read from included. */
  trees?: PersonTreeLink[];
  /** The open reports the viewer may see (Step 88.2). */
  reports?: EntryReport[];
  /** The album's photos the viewer may see (Step 88.5). */
  album?: AlbumPhoto[];
  /** The stories the viewer may see (Step 88.3). */
  stories?: EntryStory[];
  /**
   * A placeholder's held-back details (Step 98.3), for its parent or the
   * child themself; empty for anyone else, or when nothing is held back.
   */
  heldBack?: HeldBackDetails;
};

/** The route's answer: what it read, and which of those it couldn't. */
export type PersonSheetAnswer = {
  sheet: PersonSheet;
  failed: SheetSection[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The person asked about, or null when it isn't an entry id. */
export function sheetPersonParam(value: string | null): string | null {
  return value && UUID.test(value) ? value : null;
}

/**
 * The sections asked for (`want=trees,stories`), each once and in a fixed
 * order; null when none is named or one isn't a section.
 */
export function sheetSectionsParam(value: string | null): SheetSection[] | null {
  if (!value) return null;
  const asked = new Set(value.split(","));
  if (![...asked].every((s) => (SHEET_SECTIONS as readonly string[]).includes(s))) {
    return null;
  }
  return SHEET_SECTIONS.filter((s) => asked.has(s));
}

export function personSheetHref(
  personId: string,
  sections: readonly SheetSection[],
): string {
  return `/api/person-sheet?person=${encodeURIComponent(personId)}&want=${sections.join(",")}`;
}
