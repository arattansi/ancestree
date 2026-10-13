import { describe, expect, it } from "vitest";

import { joinWav, readWav, wavSeconds } from "@/lib/wav";

/** A WAV of `samples` 16-bit samples, with an extra chunk before its data when asked. */
function wav(samples: number[], options: { rate?: number; filler?: boolean } = {}): Uint8Array {
  const rate = options.rate ?? 16000;
  const filler = options.filler ? 8 + 6 : 0;
  const data = samples.length * 2;
  const bytes = new Uint8Array(44 + filler + data);
  const view = new DataView(bytes.buffer);
  const write = (at: number, text: string) => {
    for (let i = 0; i < 4; i += 1) bytes[at + i] = text.charCodeAt(i);
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + filler + data, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  let at = 36;
  if (options.filler) {
    write(at, "FLLR");
    view.setUint32(at + 4, 6, true);
    at += 14;
  }
  write(at, "data");
  view.setUint32(at + 4, data, true);
  samples.forEach((s, i) => view.setInt16(at + 8 + i * 2, s, true));
  return bytes;
}

const samplesOf = (bytes: Uint8Array) => {
  const parsed = readWav(bytes)!;
  const view = new DataView(parsed.data.buffer, parsed.data.byteOffset, parsed.data.byteLength);
  return Array.from({ length: parsed.data.length / 2 }, (_, i) => view.getInt16(i * 2, true));
};

describe("readWav", () => {
  it("finds the format and the samples, past any other chunk", () => {
    const parsed = readWav(wav([1, -2, 3], { filler: true }));
    expect(parsed?.format).toEqual({ audioFormat: 1, channels: 1, sampleRate: 16000, bitsPerSample: 16 });
    expect(parsed?.data.length).toBe(6);
  });

  it("knows a file that isn't a WAV", () => {
    expect(readWav(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(readWav(new TextEncoder().encode("RIFF....AVI LIST"))).toBeNull();
  });
});

describe("joinWav", () => {
  it("puts the recordings end to end under one header", () => {
    const joined = joinWav([wav([1, 2]), wav([3], { filler: true }), wav([4, 5])]);
    expect(joined).not.toBeNull();
    expect(samplesOf(joined!)).toEqual([1, 2, 3, 4, 5]);
    expect(joined!.length).toBe(44 + 10);
    expect(new DataView(joined!.buffer).getUint32(4, true)).toBe(36 + 10);
  });

  it("joins nothing in two formats", () => {
    expect(joinWav([wav([1]), wav([2], { rate: 44100 })])).toBeNull();
    expect(joinWav([wav([1]), new Uint8Array(4)])).toBeNull();
    expect(joinWav([])).toBeNull();
  });
});

describe("wavSeconds", () => {
  it("says how long the samples last", () => {
    expect(wavSeconds(wav(new Array(32000).fill(0)))).toBe(2);
    expect(wavSeconds(new Uint8Array(2))).toBeNull();
  });
});
