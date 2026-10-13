import { STORY_MAX, STORY_TITLE_MAX } from "@/lib/limits";

/**
 * The AI scribe (Step 148): a story told out loud on the phone, heard by the
 * phone's own speech recognizer (Apple's on an iPhone, Google's on Android),
 * written up by Claude on the server (`/api/mobile/scribe`), then read over
 * and told like any other story, through `add_story`. Claude never hears the
 * recording: it reads what the phone heard.
 *
 * Shared by the phone, which sends what it heard and tells the story, and
 * the server, which checks the request. Plain TypeScript: the phone imports
 * it too.
 */

/** What the phone may send as heard, at most: well over an hour of speech. */
export const SCRIBE_HEARD_MAX = 60000;

/** What the phone sends `/api/mobile/scribe`. */
export type ScribeRequest = {
  /** Whose leaf it's told on. */
  personId: string;
  /** What the phone heard, as it heard it, or what was typed. */
  heard: string;
  /** The language the phone listened for ("en-US", "gu-IN"); none when typed. */
  locale: string | null;
};

/** What comes back: the story as Claude wrote it up, to read over first. */
export type ScribeDraft = {
  title: string;
  /** The language it was told in, by its English name. */
  language: string;
  /** The story in the words, and the language, it was told in. */
  story: string;
  /** The same in English, or null when it was told in English. */
  english: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** A request the server can act on, or what's wrong with it. */
export function readScribeRequest(
  input: unknown,
): { request: ScribeRequest } | { problem: string } {
  if (!input || typeof input !== "object") return { problem: "Nothing was sent." };
  const { personId, heard, locale } = input as Record<string, unknown>;
  if (typeof personId !== "string" || !UUID.test(personId)) {
    return { problem: "Whose story is it?" };
  }
  if (typeof heard !== "string" || !heard.trim()) {
    return { problem: "Nothing was heard." };
  }
  if (heard.length > SCRIBE_HEARD_MAX) {
    return { problem: "That's longer than one story may be." };
  }
  if (locale != null && (typeof locale !== "string" || !LOCALE.test(locale))) {
    return { problem: "Which language was it?" };
  }
  return {
    request: { personId, heard: heard.trim(), locale: (locale as string | null) ?? null },
  };
}

/** Whether a draft came back whole: a title, and a story to tell. */
export function isScribeDraft(value: unknown): value is ScribeDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.title === "string" &&
    typeof d.language === "string" &&
    typeof d.story === "string" &&
    d.story.trim() !== "" &&
    (d.english === null || typeof d.english === "string")
  );
}

/** What a written-up story's title is cut to, to fit `add_story`. */
export function scribeTitle(title: string): string {
  const t = title.trim();
  return t.length <= STORY_TITLE_MAX ? t : `${t.slice(0, STORY_TITLE_MAX - 1).trimEnd()}…`;
}

/**
 * The story as it's told: in the words it was told in, then, when those
 * weren't English, the English under a rule. Stories are Markdown on the web
 * (`components/story-markdown.tsx`).
 */
export function scribeBody(story: string, english: string | null): string {
  const told = story.trim();
  const translated = english?.trim();
  if (!translated || translated === told) return told;
  return `${told}\n\n---\n\n*In English*\n\n${translated}`;
}

/** Whether a story would fit `add_story` (`STORY_MAX`). */
export function scribeBodyFits(body: string): boolean {
  return body.length <= STORY_MAX;
}
