/**
 * A .zip of files stored as they are, uncompressed (Step 207): what a
 * member's "download tagged media" saves. Its photos and recordings are
 * compressed already (JPEG, WebP, AAC, Opus), so squeezing them again
 * would only cost time. Built in the browser from the files it fetched,
 * as parts for a `Blob`, so the whole archive is never copied into one
 * buffer.
 *
 * The format is PKWARE's APPNOTE, without ZIP64: up to 65,535 files and
 * 4 GB in all, far past anyone's album. Names are UTF-8 (flag bit 11),
 * so a "née" or a "Skłodowska" survives.
 */

export type ZipEntry = {
  /** Its path in the archive, folders split by "/". */
  name: string;
  data: Uint8Array<ArrayBuffer>;
  /** When it last changed; the archive's own moment when left out. */
  modified?: Date;
};

const UTF8_NAMES = 0x0800;
const VERSION = 20;
const MAX_ENTRIES = 0xffff;
const MAX_BYTES = 0xffffffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 every entry carries, so an unzipper can tell it arrived whole. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A moment as MS-DOS kept it: two-second steps, from 1980, local time. */
function dosTime(when: Date): { time: number; date: number } {
  const year = Math.min(Math.max(when.getFullYear(), 1980), 2107);
  return {
    time:
      (when.getHours() << 11) |
      (when.getMinutes() << 5) |
      Math.floor(when.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

/**
 * The archive, in order: each file's header and bytes, then the central
 * directory naming them all. Throws past ZIP's limits rather than write a
 * file nothing can open.
 */
export function zipStore(
  entries: ZipEntry[],
  now: Date = new Date(),
): Uint8Array<ArrayBuffer>[] {
  if (entries.length > MAX_ENTRIES) throw new Error("Too many files for one zip.");
  const encoder = new TextEncoder();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const directory: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const size = entry.data.length;
    const crc = crc32(entry.data);
    const { time, date } = dosTime(entry.modified ?? now);
    if (offset + 30 + name.length + size > MAX_BYTES) {
      throw new Error("Too much for one zip.");
    }

    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, VERSION, true);
    l.setUint16(6, UTF8_NAMES, true);
    l.setUint16(8, 0, true); // stored
    l.setUint16(10, time, true);
    l.setUint16(12, date, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, size, true);
    l.setUint32(22, size, true);
    l.setUint16(26, name.length, true);
    l.setUint16(28, 0, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, VERSION, true);
    c.setUint16(6, VERSION, true);
    c.setUint16(8, UTF8_NAMES, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, time, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, size, true);
    c.setUint32(24, size, true);
    c.setUint16(28, name.length, true);
    // Extra field, comment, disk, internal and external attributes: none.
    c.setUint32(42, offset, true);
    central.set(name, 46);

    parts.push(local, entry.data);
    directory.push(central);
    offset += local.length + size;
  }

  const directorySize = directory.reduce((n, d) => n + d.length, 0);
  if (offset + directorySize + 22 > MAX_BYTES) throw new Error("Too much for one zip.");
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, directorySize, true);
  e.setUint32(16, offset, true);

  return [...parts, ...directory, end];
}
