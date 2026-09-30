import { describe, expect, it } from "vitest";

import { STORY_FOLD_CHARS, STORY_FOLD_LINES, isLongStory } from "@/lib/story-text";

describe("isLongStory", () => {
  it("leaves a short story whole", () => {
    expect(isLongStory("Grandpa built a boat.")).toBe(false);
    expect(isLongStory("a".repeat(STORY_FOLD_CHARS))).toBe(false);
    expect(isLongStory(Array(STORY_FOLD_LINES).fill("line").join("\n"))).toBe(false);
  });

  it("folds one long in characters or in lines", () => {
    expect(isLongStory("a".repeat(STORY_FOLD_CHARS + 1))).toBe(true);
    expect(isLongStory(Array(STORY_FOLD_LINES + 1).fill("x").join("\n"))).toBe(true);
  });
});
