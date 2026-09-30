import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  Quality,
  canEncodeAudio,
} from "mediabunny";

import { STORY_AUDIO_MAX_MB } from "@/lib/limits";
import {
  STORY_AUDIO_MAX_BYTES,
  STORY_AUDIO_TYPES,
  keepOriginal,
  storyAudioType,
} from "@/lib/story-audio";

/**
 * A story's recording made ready to send, in the browser (Step 88.3). Where
 * the browser can encode audio (WebCodecs), it's remade as one channel of
 * speech: AAC in an .m4a, which every browser plays, or else Opus in an
 * .ogg (Firefox, which has no AAC encoder; Safari plays those from 18.4).
 * Mediabunny reads the file as a stream, so an hour's recording never sits
 * in memory whole. Where the browser can't, the file goes as it is, if the
 * bucket takes it. Loaded only once someone picks a recording.
 */

export type StoryAudio = {
  blob: Blob;
  type: string;
  ext: string;
  /** Its length, when it could be read. */
  seconds: number | null;
};

const SPEECH = { numberOfChannels: 1, sampleRate: 48000 } as const;

// AAC below 48 kbps is refused by macOS's encoder once it starts, though
// the browser says it's supported.
const TARGETS = [
  { codec: "aac", bitrate: 48_000, type: "audio/mp4", ext: "m4a", format: () => new Mp4OutputFormat() },
  { codec: "opus", bitrate: 24_000, type: "audio/ogg", ext: "ogg", format: () => new OggOutputFormat() },
] as const;

type Target = (typeof TARGETS)[number];

export const NOT_A_RECORDING = "That isn’t a recording that can be played here.";
export const TOO_LONG = `Keep it under ${STORY_AUDIO_MAX_MB} MB.`;

async function lengthOf(input: Input): Promise<number | null> {
  try {
    const seconds = await input.computeDuration();
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}

/** `file` remade for `target`, or null when that didn't work. */
async function remake(
  file: File,
  target: Target,
  onProgress?: (progress: number) => void,
): Promise<StoryAudio | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    if (!(await input.getPrimaryAudioTrack())) return null;
    const seconds = await lengthOf(input);
    const output = new Output({ format: target.format(), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      video: { discard: true },
      audio: {
        ...SPEECH,
        codec: target.codec,
        quality: new Quality({ bitrate: target.bitrate }),
        forceTranscode: true,
      },
      showWarnings: false,
    });
    if (!conversion.isValid) return null;
    if (onProgress) conversion.onProgress = (p) => onProgress(p);
    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer) return null;
    return {
      blob: new Blob([buffer], { type: target.type }),
      type: target.type,
      ext: target.ext,
      seconds,
    };
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

/**
 * Remade as speech, or null when the browser can't: each encoder it says
 * it has, in turn, until one works.
 */
async function shrink(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<StoryAudio | null> {
  if (typeof AudioEncoder === "undefined") return null;
  for (const target of TARGETS) {
    const quality = new Quality({ bitrate: target.bitrate });
    if (!(await canEncodeAudio(target.codec, { ...SPEECH, quality }))) continue;
    onProgress?.(0);
    const made = await remake(file, target, onProgress);
    if (made) return made;
  }
  return null;
}

/** How long the picked file is, read without remaking it. */
async function readLength(file: File): Promise<number | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    return await lengthOf(input);
  } finally {
    input.dispose();
  }
}

/**
 * The recording to send for `file`: shrunk where the browser can, else the
 * file itself; or why it can't go.
 */
export async function prepareStoryAudio(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<StoryAudio | { error: string }> {
  const originalType = storyAudioType(file);
  const shrunk = await shrink(file, onProgress);

  if (shrunk && !(originalType && keepOriginal({ type: originalType, size: file.size }, shrunk.blob.size))) {
    return shrunk.blob.size <= STORY_AUDIO_MAX_BYTES ? shrunk : { error: TOO_LONG };
  }
  if (!originalType) return { error: NOT_A_RECORDING };
  if (file.size > STORY_AUDIO_MAX_BYTES) return { error: TOO_LONG };
  return {
    blob: file,
    type: originalType,
    ext: STORY_AUDIO_TYPES[originalType],
    seconds: shrunk?.seconds ?? (await readLength(file)),
  };
}
