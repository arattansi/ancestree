import { describe, expect, it } from "vitest";

import { STORY_TITLE_MAX } from "@/lib/limits";
import {
  isScribeDraft,
  readScribeRequest,
  SCRIBE_HEARD_MAX,
  scribeBody,
  scribeTitle,
} from "@/lib/scribe";

const ID = "4b8f3c2e-1d2a-4c5b-9e8f-0a1b2c3d4e5f";

describe("readScribeRequest", () => {
  it("takes what the phone heard, trimmed, and the language it listened for", () => {
    expect(readScribeRequest({ personId: ID, heard: "  we came by boat ", locale: "gu-IN" })).toEqual({
      request: { personId: ID, heard: "we came by boat", locale: "gu-IN" },
    });
  });

  it("takes typed words with no language", () => {
    expect(readScribeRequest({ personId: ID, heard: "hello", locale: null })).toEqual({
      request: { personId: ID, heard: "hello", locale: null },
    });
    expect(readScribeRequest({ personId: ID, heard: "hello" })).toEqual({
      request: { personId: ID, heard: "hello", locale: null },
    });
  });

  it("refuses a request it can't act on", () => {
    expect(readScribeRequest(null)).toEqual({ problem: "Nothing was sent." });
    expect(readScribeRequest({ personId: "nobody", heard: "x" })).toEqual({
      problem: "Whose story is it?",
    });
    expect(readScribeRequest({ personId: ID, heard: "   " })).toEqual({
      problem: "Nothing was heard.",
    });
    expect(readScribeRequest({ personId: ID, heard: "x".repeat(SCRIBE_HEARD_MAX + 1) })).toEqual({
      problem: "That's longer than one story may be.",
    });
    expect(readScribeRequest({ personId: ID, heard: "x", locale: "en US; drop" })).toEqual({
      problem: "Which language was it?",
    });
  });
});

describe("isScribeDraft", () => {
  it("knows a whole draft", () => {
    expect(isScribeDraft({ title: "The boat", language: "English", story: "We came.", english: null })).toBe(true);
    expect(isScribeDraft({ title: "The boat", language: "Gujarati", story: "અમે", english: "We" })).toBe(true);
  });

  it("knows one that isn't", () => {
    expect(isScribeDraft({ title: "The boat", language: "English", story: " ", english: null })).toBe(false);
    expect(isScribeDraft({ title: "The boat", story: "We came." })).toBe(false);
    expect(isScribeDraft(null)).toBe(false);
  });
});

describe("scribeTitle", () => {
  it("keeps a title that fits", () => {
    expect(scribeTitle("  The boat to Mombasa ")).toBe("The boat to Mombasa");
  });

  it("cuts one that doesn't", () => {
    const cut = scribeTitle("a".repeat(STORY_TITLE_MAX + 20));
    expect(cut).toHaveLength(STORY_TITLE_MAX);
    expect(cut.endsWith("…")).toBe(true);
  });
});

describe("scribeBody", () => {
  it("is the story alone when it was told in English", () => {
    expect(scribeBody(" We came by boat. ", null)).toBe("We came by boat.");
    expect(scribeBody("We came by boat.", "We came by boat.")).toBe("We came by boat.");
  });

  it("puts the English under the story told in another language", () => {
    expect(scribeBody("અમે વહાણમાં આવ્યા.", "We came by boat.")).toBe(
      "અમે વહાણમાં આવ્યા.\n\n---\n\n*In English*\n\nWe came by boat.",
    );
  });
});
