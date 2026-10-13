/**
 * Joining WAV recordings end to end (Step 148): the phone keeps a recording
 * for each stretch someone talks between pauses, all in the one format it
 * asked for (16 kHz, 16-bit, mono PCM), and a story keeps one recording.
 * Pure bytes, so the phone can do it and the web's tests can check it.
 */

export type WavFormat = {
  /** 1 is integer PCM. */
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
};

type Parsed = { format: WavFormat; data: Uint8Array };

const ascii = (bytes: Uint8Array, at: number) =>
  String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);

/** A WAV file's format and its samples, or null when it isn't one. */
export function readWav(bytes: Uint8Array): Parsed | null {
  if (bytes.length < 12 || ascii(bytes, 0) !== "RIFF" || ascii(bytes, 8) !== "WAVE") {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format: WavFormat | null = null;
  // Chunks follow the header, each an id, a little-endian size and its
  // bytes, padded to an even length: "fmt ", "data", and any others a
  // recorder adds ("FLLR", "LIST"), which are skipped.
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = ascii(bytes, at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === "fmt " && size >= 16 && body + 16 <= bytes.length) {
      format = {
        audioFormat: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!format) return null;
      // A recorder cut short may leave the size unwritten: take what's there.
      const end = Math.min(body + size, bytes.length);
      return { format, data: bytes.subarray(body, end) };
    }
    at = body + size + (size % 2);
  }
  return null;
}

const sameFormat = (a: WavFormat, b: WavFormat) =>
  a.audioFormat === b.audioFormat &&
  a.channels === b.channels &&
  a.sampleRate === b.sampleRate &&
  a.bitsPerSample === b.bitsPerSample;

/** A plain 44-byte header for `dataBytes` of samples in `format`. */
function header(format: WavFormat, dataBytes: number): Uint8Array {
  const bytes = new Uint8Array(44);
  const view = new DataView(bytes.buffer);
  const write = (at: number, text: string) => {
    for (let i = 0; i < 4; i += 1) bytes[at + i] = text.charCodeAt(i);
  };
  const blockAlign = (format.channels * format.bitsPerSample) / 8;
  write(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format.audioFormat, true);
  view.setUint16(22, format.channels, true);
  view.setUint32(24, format.sampleRate, true);
  view.setUint32(28, format.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, format.bitsPerSample, true);
  write(36, "data");
  view.setUint32(40, dataBytes, true);
  return bytes;
}

/**
 * The recordings as one, in order, or null when one isn't a WAV or they
 * aren't all in the same format.
 */
export function joinWav(parts: Uint8Array[]): Uint8Array | null {
  const parsed = parts.map(readWav);
  const first = parsed[0];
  if (!first || parsed.some((p) => !p || !sameFormat(p.format, first.format))) return null;
  const total = parsed.reduce((sum, p) => sum + p!.data.length, 0);
  const out = new Uint8Array(44 + total);
  out.set(header(first.format, total), 0);
  let at = 44;
  for (const p of parsed) {
    out.set(p!.data, at);
    at += p!.data.length;
  }
  return out;
}

/** How long a WAV's samples last, in whole seconds. */
export function wavSeconds(bytes: Uint8Array): number | null {
  const wav = readWav(bytes);
  if (!wav) return null;
  const perSecond = (wav.format.sampleRate * wav.format.channels * wav.format.bitsPerSample) / 8;
  return perSecond > 0 ? Math.round(wav.data.length / perSecond) : null;
}
