import { describe, expect, it } from "vitest";

import { isStoryToken, storyLinkPath } from "@/lib/story-links";

describe("isStoryToken", () => {
  it("takes what share_story makes: 24 URL-safe base64 characters", () => {
    expect(isStoryToken("Ab3_-9zZxYwVuT0sRqPoNmLk")).toBe(true);
  });

  it("refuses anything else before it's looked up", () => {
    expect(isStoryToken("")).toBe(false);
    expect(isStoryToken("Ab3_-9zZxYwVuT0sRqPoNmL")).toBe(false);
    expect(isStoryToken("Ab3_-9zZxYwVuT0sRqPoNmLkk")).toBe(false);
    expect(isStoryToken("Ab3+/9zZxYwVuT0sRqPoNmLk")).toBe(false);
    expect(isStoryToken("Ab3_-9zZxYwVuT0sRqPoNm=")).toBe(false);
    // A tree share link's token is 64 hex characters.
    expect(isStoryToken("a".repeat(64))).toBe(false);
  });
});

describe("storyLinkPath", () => {
  it("is under /shared, which the proxy lets anyone open", () => {
    expect(storyLinkPath("Ab3_-9zZxYwVuT0sRqPoNmLk")).toBe(
      "/shared/story/Ab3_-9zZxYwVuT0sRqPoNmLk",
    );
  });
});
