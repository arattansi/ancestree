import { describe, expect, it } from "vitest";

import {
  formatDuration,
  isStoryAudioPath,
  keepOriginal,
  storyAudioPath,
  storyAudioType,
} from "@/lib/story-audio";

const PERSON = "9c6dfe6d-f42a-4d68-95cd-2bdbc5b740fd";
const ID = "0b8a6a52-3f1d-4a55-9d0e-6a3c9e2f7b11";

describe("storyAudioType", () => {
  it("keeps a type the bucket takes", () => {
    expect(storyAudioType({ type: "audio/mpeg", name: "a.mp3" })).toBe("audio/mpeg");
    expect(storyAudioType({ type: "audio/x-m4a", name: "memo.m4a" })).toBe("audio/x-m4a");
  });

  it("reads the name when the type is blank or a video's", () => {
    expect(storyAudioType({ type: "", name: "Memo.M4A" })).toBe("audio/mp4");
    expect(storyAudioType({ type: "video/mp4", name: "memo.m4a" })).toBe("audio/mp4");
    expect(storyAudioType({ type: "", name: "talk.opus" })).toBe("audio/ogg");
  });

  it("refuses what isn't a recording", () => {
    expect(storyAudioType({ type: "image/png", name: "a.png" })).toBeNull();
    expect(storyAudioType({ type: "", name: "notes.txt" })).toBeNull();
    expect(storyAudioType({ type: "audio/amr", name: "a.amr" })).toBeNull();
    // A named type other than a blank or a video's isn't second-guessed.
    expect(storyAudioType({ type: "text/plain", name: "a.mp3" })).toBeNull();
  });
});

describe("keepOriginal", () => {
  it("keeps a smaller file that plays everywhere", () => {
    expect(keepOriginal({ type: "audio/mpeg", size: 100 }, 200)).toBe(true);
    expect(keepOriginal({ type: "audio/mp4", size: 200 }, 200)).toBe(true);
  });

  it("sends the shrunk copy otherwise", () => {
    expect(keepOriginal({ type: "audio/mpeg", size: 300 }, 200)).toBe(false);
    // Ogg doesn't play on older iPhones.
    expect(keepOriginal({ type: "audio/ogg", size: 100 }, 200)).toBe(false);
    expect(keepOriginal({ type: "audio/wav", size: 100 }, 200)).toBe(false);
  });
});

describe("story audio paths", () => {
  it("puts a recording in its person's folder", () => {
    const path = storyAudioPath(PERSON, "m4a", ID);
    expect(path).toBe(`${PERSON}/${ID}.m4a`);
    expect(isStoryAudioPath(PERSON, path)).toBe(true);
  });

  it("refuses another folder, a nested path or a strange extension", () => {
    const other = "11111111-2222-4333-8444-555555555555";
    expect(isStoryAudioPath(other, `${PERSON}/${ID}.m4a`)).toBe(false);
    expect(isStoryAudioPath(PERSON, `${PERSON}/x/${ID}.m4a`)).toBe(false);
    expect(isStoryAudioPath(PERSON, `${PERSON}/${ID}.exe`)).toBe(false);
    expect(isStoryAudioPath(PERSON, `${PERSON}/../${ID}.m4a`)).toBe(false);
    expect(isStoryAudioPath(PERSON, `${PERSON}/${ID}.m4a.png`)).toBe(false);
  });
});

describe("formatDuration", () => {
  it("says minutes and seconds, and hours when there are any", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(42.4)).toBe("0:42");
    expect(formatDuration(725)).toBe("12:05");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(-5)).toBe("0:00");
  });
});
