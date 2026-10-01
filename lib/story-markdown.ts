/**
 * Reading a Markdown file into a story (Step 99): its text, and a title when
 * the file names one, so what's written elsewhere (a notes app's export, say)
 * lands as it was.
 */

/** A file bigger than this isn't read: a story is 20,000 characters at most. */
export const STORY_FILE_MAX_BYTES = 1024 * 1024;

export const STORY_FILE_ACCEPT = ".md,.markdown,.mdown,.txt,text/markdown,text/plain";

export type StoryFile = {
  /** From the file's front matter or its first heading, if it has one that fits. */
  title: string | null;
  body: string;
};

function unquote(value: string): string {
  const v = value.trim();
  return /^(["']).*\1$/.test(v) && v.length >= 2 ? v.slice(1, -1).trim() : v;
}

/**
 * The story in a Markdown file. Front matter (`---` fenced, at the top) is
 * dropped, and its `title:` is the title; failing that, a first line of
 * `# Heading` is, and goes from the text, since the title shows above it.
 * A title longer than `titleMax` stays where it was, in the text.
 */
export function readStoryFile(raw: string, titleMax: number): StoryFile {
  let text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  let title: string | null = null;

  // Front matter opens with a `key:` line; a story that only starts with a
  // `---` rule keeps what follows it.
  const front = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(text);
  if (front && /^[A-Za-z_][\w-]*[ \t]*:/.test(front[1])) {
    text = text.slice(front[0].length);
    const line = /^title[ \t]*:[ \t]*(.+)$/im.exec(front[1]);
    const t = line ? unquote(line[1]) : "";
    if (t && t.length <= titleMax) title = t;
  }

  text = text.replace(/^\s*\n/, "");
  if (!title) {
    const heading = /^#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\n|$)/.exec(text);
    const t = heading ? heading[1].trim() : "";
    if (heading && t && t.length <= titleMax) {
      title = t;
      text = text.slice(heading[0].length).replace(/^\s*\n/, "");
    }
  }
  return { title, body: text.trim() };
}

/**
 * What `text` becomes when `incoming` is added to it: it, if the text is
 * empty; else after it, a blank line between.
 */
export function addToStory(text: string, incoming: string): string {
  const current = text.trimEnd();
  return current ? `${current}\n\n${incoming}` : incoming;
}
