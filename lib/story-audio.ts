import { STORY_AUDIO_MAX_MB } from "@/lib/limits";

/**
 * A story's recording (Step 88.3): what the `stories` bucket takes, where a
 * file goes in it, and how long one is, said. Shared by the browser, which
 * shrinks and uploads it, and the server, which checks the path it's given.
 */

/** The bucket's limit, in bytes. */
export const STORY_AUDIO_MAX_BYTES = STORY_AUDIO_MAX_MB * 1024 * 1024;

/** Each type the bucket takes, and the extension a file of it is kept under. */
export const STORY_AUDIO_TYPES: Readonly<Record<string, string>> = {
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
};

/** A file's extension, where the browser didn't say its type. */
const TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  webm: "audio/webm",
  wav: "audio/wav",
  flac: "audio/flac",
};

/**
 * The type a picked file is kept as, or null when the bucket won't take it.
 * Some systems leave `type` blank, or call an .m4a `video/mp4`; its name
 * says then.
 */
export function storyAudioType(file: { type: string; name: string }): string | null {
  if (STORY_AUDIO_TYPES[file.type]) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const byName = TYPE_BY_EXTENSION[ext];
  if (byName && (!file.type || file.type === "video/mp4" || file.type === "application/octet-stream")) {
    return byName;
  }
  return null;
}

/** Types every browser plays, so a small original can go as it is. */
const PLAYS_EVERYWHERE = new Set(["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac"]);

/**
 * Whether to send the picked file itself rather than the browser's shrunk
 * copy: only when it's smaller already and plays everywhere.
 */
export function keepOriginal(
  original: { type: string; size: number },
  shrunkSize: number,
): boolean {
  return PLAYS_EVERYWHERE.has(original.type) && original.size <= shrunkSize;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EXTENSIONS = [...new Set(Object.values(STORY_AUDIO_TYPES))].join("|");

/** Where a new recording of `personId`'s story goes: their folder, a fresh name. */
export function storyAudioPath(personId: string, ext: string, id: string): string {
  return `${personId}/${id}.${ext}`;
}

/** Whether `path` is a recording's place in `personId`'s folder. */
export function isStoryAudioPath(personId: string, path: string): boolean {
  return new RegExp(`^${personId}/${UUID}\\.(${EXTENSIONS})$`).test(path);
}

/** A recording's length: "0:42", "12:05", "1:02:03". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
