/**
 * What the phone has heard so far while someone tells a story (Step 148),
 * from its speech recognizer's results as they come. The two phones report
 * differently: Android hears in segments, each ending in a final result,
 * while an iPhone revises one growing transcript and gives it as final only
 * at the end, though after a long pause it may start a fresh one, dropping
 * what came before. Each pause the teller takes, or listening that stops on
 * its own, starts another session; whatever was kept carries over.
 */

export type Heard = {
  /** What's settled: finished segments, and sessions before this one. */
  kept: string[];
  /** What the recognizer is still revising. */
  live: string;
};

export const NOTHING_HEARD: Heard = { kept: [], live: "" };

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Whether `next` starts over rather than revising `live`: much shorter, and
 * not beginning as `live` did. A recognizer revising its guess changes a
 * word here and there; one that has started over has lost the start.
 */
function startedOver(live: string, next: string): boolean {
  const was = squash(live);
  const now = squash(next);
  if (was.length < 20 || now.length >= was.length * 0.6) return false;
  const opening = now.slice(0, Math.min(12, now.length));
  return !was.startsWith(opening);
}

/** What's heard once the recognizer reports `transcript`. */
export function hear(heard: Heard, transcript: string, isFinal: boolean): Heard {
  const next = transcript.trim();
  let kept = heard.kept;
  if (heard.live && startedOver(heard.live, next)) kept = [...kept, heard.live];
  if (isFinal) return { kept: next ? [...kept, next] : kept, live: "" };
  return { kept, live: next };
}

/** A session has ended: whatever was live is kept as it was last heard. */
export function settle(heard: Heard): Heard {
  return heard.live ? { kept: [...heard.kept, heard.live], live: "" } : heard;
}

/** Everything heard, as one text. */
export function heardText(heard: Heard): string {
  return [...heard.kept, heard.live].filter(Boolean).join(" ").trim();
}
