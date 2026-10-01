import { describe, expect, it } from "vitest";

import { addToStory, readStoryFile } from "@/lib/story-markdown";

describe("readStoryFile", () => {
  it("takes a first # heading as the title and drops it from the text", () => {
    expect(readStoryFile("# The Farm\n\nWe milked at five.\n", 120)).toEqual({
      title: "The Farm",
      body: "We milked at five.",
    });
  });

  it("reads the title and drops the front matter", () => {
    const file = '---\ntitle: "Eid, 1962"\ntags: [a]\n---\n\n# Ignored\n\nText';
    expect(readStoryFile(file, 120)).toEqual({
      title: "Eid, 1962",
      body: "# Ignored\n\nText",
    });
  });

  it("keeps a story that only starts with a --- rule", () => {
    const file = "---\nIt was a cold winter.\n\n---\n\nThe end.";
    expect(readStoryFile(file, 120)).toEqual({ title: null, body: file });
  });

  it("leaves a heading that isn't first, or isn't level one, in the text", () => {
    expect(readStoryFile("Intro\n\n# Later", 120).title).toBeNull();
    expect(readStoryFile("## Sub\n\ntext", 120)).toEqual({
      title: null,
      body: "## Sub\n\ntext",
    });
  });

  it("keeps a title that's too long where it was", () => {
    const long = "x".repeat(121);
    expect(readStoryFile(`# ${long}\n\ntext`, 120)).toEqual({
      title: null,
      body: `# ${long}\n\ntext`,
    });
  });

  it("copes with a byte order mark, CRLF and a closed heading", () => {
    expect(readStoryFile("﻿# A ##\r\n\r\nB\r\nC", 120)).toEqual({
      title: "A",
      body: "B\nC",
    });
  });

  it("returns an empty body for an empty file", () => {
    expect(readStoryFile("  \n", 120)).toEqual({ title: null, body: "" });
  });
});

describe("addToStory", () => {
  it("replaces nothing: it starts an empty story and follows a written one", () => {
    expect(addToStory("", "new")).toBe("new");
    expect(addToStory("  \n", "new")).toBe("new");
    expect(addToStory("old\n", "new")).toBe("old\n\nnew");
  });
});
