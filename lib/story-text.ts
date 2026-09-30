/**
 * How a story's text shows on an entry's sheet (Step 88.3): a long one is
 * folded to its first few lines, with "Read more".
 */

/** Past this many characters, or lines, a story is folded. */
export const STORY_FOLD_CHARS = 480;
export const STORY_FOLD_LINES = 6;

/** Whether `body` is long enough to fold. */
export function isLongStory(body: string): boolean {
  return (
    body.length > STORY_FOLD_CHARS ||
    body.split("\n").length > STORY_FOLD_LINES
  );
}
