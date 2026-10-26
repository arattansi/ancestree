import { describe, expect, it } from "vitest";

import { crc32, zipStore } from "@/lib/zip";

const bytes = (text: string) => new TextEncoder().encode(text);

function joined(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Each file back out of the archive, found as an unzipper finds it: from the end. */
function unzip(zip: Uint8Array): { name: string; text: string; crc: number }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const name = decoder.decode(zip.subarray(at + 46, at + 46 + nameLength));
    const local = view.getUint32(at + 42, true);
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    expect(view.getUint16(local + 8, true)).toBe(0); // stored
    const localName = view.getUint16(local + 26, true);
    const start = local + 30 + localName;
    const data = zip.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    files.push({ name, text: decoder.decode(data), crc });
    at += 46 + nameLength;
  }
  return files;
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("zipStore", () => {
  it("stores each file whole, under its UTF-8 name", () => {
    const zip = joined(
      zipStore([
        { name: "images/portrait.jpg", data: bytes("a photo") },
        { name: "documents/Laila Curie née Skłodowska.md", data: bytes("# story\n") },
        { name: "empty.txt", data: new Uint8Array() },
      ]),
    );
    expect(unzip(zip)).toEqual([
      { name: "images/portrait.jpg", text: "a photo", crc: crc32(bytes("a photo")) },
      {
        name: "documents/Laila Curie née Skłodowska.md",
        text: "# story\n",
        crc: crc32(bytes("# story\n")),
      },
      { name: "empty.txt", text: "", crc: 0 },
    ]);
    // Bit 11: the names are UTF-8.
    expect(new DataView(zip.buffer).getUint16(6, true)).toBe(0x0800);
  });

  it("is a valid empty archive with nothing in it", () => {
    const zip = joined(zipStore([]));
    expect(zip.length).toBe(22);
    expect(unzip(zip)).toEqual([]);
  });

  it("dates each file as DOS does", () => {
    const zip = joined(
      zipStore([{ name: "a", data: bytes("x"), modified: new Date(2026, 9, 26, 13, 45, 31) }]),
    );
    const view = new DataView(zip.buffer);
    expect(view.getUint16(10, true)).toBe((13 << 11) | (45 << 5) | 15);
    expect(view.getUint16(12, true)).toBe(((2026 - 1980) << 9) | (10 << 5) | 26);
  });
});
