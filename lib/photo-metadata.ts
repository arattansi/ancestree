import { descendants, parseXml, type XmlElement } from "@/lib/xml-lite";

/**
 * What a photo says about itself (Step 88.6), read from the file as it was
 * picked, before the album shrinks it: the shrinking draws it on a canvas,
 * which keeps none of it. Two things are read, and nothing else:
 *
 * - **Who's in it**, as whoever tagged the photo named them: the named face
 *   regions Lightroom, digiKam and Picasa write (Metadata Working Group) and
 *   Windows Photo Gallery writes (Microsoft), IPTC's "person shown", and
 *   keywords (XMP, IPTC and Windows' own). A phone's camera and Apple or
 *   Google Photos exports rarely carry names; a photo with none simply
 *   suggests nobody. Faces themselves are never looked at.
 * - **When it was taken**, from the camera's own date or a date someone
 *   wrote in later (a scan's "1962"), as much of it as is known.
 *
 * Where it was taken (GPS) is never read. None of this leaves the device
 * but the date, and only if it's kept on the form. JPEG, PNG and WebP are
 * read, which is what the album takes; anything else reads as nothing.
 */

/** How sure the photo is that a name is a person in it. */
export type PhotoNameSource =
  /** A named face region. */
  | "region"
  /** IPTC's "person shown". */
  | "shown"
  /** A keyword filed under People (or Family, …) in a keyword tree. */
  | "people"
  /** Any other keyword, which may be a person or a place or a party. */
  | "keyword";

export type PhotoName = { name: string; source: PhotoNameSource };

export type PhotoMetadata = {
  /** Strongest first, each name once. */
  names: PhotoName[];
  /** When it was taken, as a partial ISO date: "1987-06-05", "1987-06" or
   *  "1987", the form `DateField` holds; null when the photo doesn't say. */
  taken: string | null;
};

export const NO_METADATA: PhotoMetadata = { names: [], taken: null };

/** More than any photo's metadata; a larger file is read this far. */
const READ_LIMIT = 32 * 1024 * 1024;

/** The first photograph that survives was taken in 1826 or 1827: an
 *  earlier date in a photo's metadata is a reset clock, not a date. */
const FIRST_PHOTO_YEAR = 1826;

const NAMES_MAX = 200;
const NAME_LENGTH_MAX = 120;

/** Read what `file` says about itself. Never throws. */
export async function readPhotoMetadata(file: Blob): Promise<PhotoMetadata> {
  try {
    const bytes = new Uint8Array(
      await file.slice(0, Math.min(file.size, READ_LIMIT)).arrayBuffer(),
    );
    return await parsePhotoMetadata(bytes);
  } catch {
    return NO_METADATA;
  }
}

// ---------------------------------------------------------------------------
// Where each format keeps it
// ---------------------------------------------------------------------------

type Found = {
  /** EXIF, each a TIFF structure. */
  tiff: Uint8Array[];
  xmp: string[];
  /** IPTC-IIM records. */
  iptc: Uint8Array[];
};

/** What `bytes` (a whole file, or its start) says about itself. Never
 *  throws; a file cut short gives what came before the cut. */
export async function parsePhotoMetadata(
  bytes: Uint8Array,
  today: Date = new Date(),
): Promise<PhotoMetadata> {
  const found: Found = { tiff: [], xmp: [], iptc: [] };
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) readJpeg(bytes, found);
    else if (startsWith(bytes, 0, PNG_SIGNATURE)) await readPng(bytes, found);
    else if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
      readWebp(bytes, found);
    }
  } catch {
    // What was found before it broke still counts.
  }
  return interpret(found, today);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const XMP_JPEG = "http://ns.adobe.com/xap/1.0/\0";
const XMP_EXTENSION = "http://ns.adobe.com/xmp/extension/\0";
const XMP_KEYWORD = "XML:com.adobe.xmp";

function startsWith(bytes: Uint8Array, at: number, prefix: number[]): boolean {
  return prefix.every((b, i) => bytes[at + i] === b);
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  let s = "";
  for (let i = at; i < at + length && i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

const utf8 = new TextDecoder("utf-8");

function text(bytes: Uint8Array): string {
  return utf8.decode(bytes).replace(/^﻿/, "");
}

/**
 * JPEG: segments up to the image data. APP1 holds EXIF or XMP (a long
 * packet continues in "extended" segments, put back together here), APP13
 * Photoshop's resources, IPTC among them.
 */
function readJpeg(bytes: Uint8Array, found: Found) {
  const extended = new Map<string, { data: Uint8Array; got: number }>();
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) break;
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at += 1; // fill
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    // The image data starts, or the image ends: nothing more to read.
    if (marker === 0xda || marker === 0xd9) break;
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    if (length < 2) break;
    const start = at + 4;
    const end = Math.min(at + 2 + length, bytes.length);
    const seg = bytes.subarray(start, end);
    if (marker === 0xe1) {
      if (ascii(seg, 0, 6) === "Exif\0\0") {
        found.tiff.push(seg.subarray(6));
      } else if (ascii(seg, 0, XMP_JPEG.length) === XMP_JPEG) {
        found.xmp.push(text(seg.subarray(XMP_JPEG.length)));
      } else if (ascii(seg, 0, XMP_EXTENSION.length) === XMP_EXTENSION) {
        const head = XMP_EXTENSION.length;
        const guid = ascii(seg, head, 32);
        const view = new DataView(seg.buffer, seg.byteOffset, seg.byteLength);
        const full = view.getUint32(head + 32);
        const offset = view.getUint32(head + 36);
        const chunk = seg.subarray(head + 40);
        if (full <= READ_LIMIT && offset + chunk.length <= full) {
          let part = extended.get(guid);
          if (!part) {
            part = { data: new Uint8Array(full), got: 0 };
            extended.set(guid, part);
          }
          part.data.set(chunk, offset);
          part.got += chunk.length;
        }
      }
    } else if (marker === 0xed && ascii(seg, 0, 14) === "Photoshop 3.0\0") {
      readPhotoshop(seg.subarray(14), found);
    }
    at += 2 + length;
  }
  for (const part of extended.values()) {
    if (part.got >= part.data.length) found.xmp.push(text(part.data));
  }
}

/** Photoshop's image resources: IPTC is resource 0x0404. */
function readPhotoshop(bytes: Uint8Array, found: Found) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  while (at + 12 <= bytes.length && ascii(bytes, at, 4) === "8BIM") {
    const id = view.getUint16(at + 4);
    const nameLength = bytes[at + 6];
    // The name, with its length byte, takes an even number of bytes.
    let p = at + 6 + nameLength + 1;
    if (p % 2 !== at % 2) p += 1;
    if (p + 4 > bytes.length) break;
    const size = view.getUint32(p);
    const data = bytes.subarray(p + 4, Math.min(p + 4 + size, bytes.length));
    if (id === 0x0404) found.iptc.push(data);
    at = p + 4 + size + (size % 2);
  }
}

/** PNG: an `eXIf` chunk holds EXIF; an iTXt or zTXt named for XMP, XMP. */
async function readPng(bytes: Uint8Array, found: Found) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = ascii(bytes, at + 4, 4);
    const data = bytes.subarray(at + 8, Math.min(at + 8 + length, bytes.length));
    if (type === "IEND") break;
    if (type === "eXIf") {
      found.tiff.push(data);
    } else if (type === "iTXt" || type === "zTXt") {
      const keywordEnd = data.indexOf(0);
      if (keywordEnd > 0 && ascii(data, 0, keywordEnd) === XMP_KEYWORD) {
        const xmp = await pngText(type, data.subarray(keywordEnd + 1));
        if (xmp) found.xmp.push(xmp);
      }
    }
    at += 12 + length;
  }
}

/** An iTXt or zTXt chunk's text, from just past its keyword. */
async function pngText(type: string, rest: Uint8Array): Promise<string | null> {
  if (type === "zTXt") return text(await inflate(rest.subarray(1)));
  // iTXt: compressed?, method, language\0, translated keyword\0, text.
  const compressed = rest[0] === 1;
  const languageEnd = rest.indexOf(0, 2);
  const translatedEnd = languageEnd < 0 ? -1 : rest.indexOf(0, languageEnd + 1);
  if (translatedEnd < 0) return null;
  const body = rest.subarray(translatedEnd + 1);
  return text(compressed ? await inflate(body) : body);
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** WebP: `EXIF` and `XMP ` chunks. */
function readWebp(bytes: Uint8Array, found: Found) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 12;
  while (at + 8 <= bytes.length) {
    const type = ascii(bytes, at, 4);
    const size = view.getUint32(at + 4, true);
    const data = bytes.subarray(at + 8, Math.min(at + 8 + size, bytes.length));
    if (type === "EXIF") {
      found.tiff.push(ascii(data, 0, 6) === "Exif\0\0" ? data.subarray(6) : data);
    } else if (type === "XMP ") {
      found.xmp.push(text(data));
    }
    at += 8 + size + (size % 2);
  }
}

// ---------------------------------------------------------------------------
// EXIF
// ---------------------------------------------------------------------------

const TYPE_SIZES: Record<number, number> = {
  1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8,
};

const TAG_EXIF_IFD = 0x8769;
const TAG_XP_KEYWORDS = 0x9c9e;
const TAG_DATE_TIME_ORIGINAL = 0x9003;

type Exif = { dateTimeOriginal: string | null; xpKeywords: string | null };

/**
 * The two EXIF values wanted: the date the photo was taken (in the EXIF
 * directory) and Windows' "Tags" (XPKeywords, in the first). The GPS
 * directory is never opened.
 */
function readTiff(t: Uint8Array): Exif {
  const out: Exif = { dateTimeOriginal: null, xpKeywords: null };
  const little = t[0] === 0x49 && t[1] === 0x49;
  if (!little && !(t[0] === 0x4d && t[1] === 0x4d)) return out;
  const view = new DataView(t.buffer, t.byteOffset, t.byteLength);
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);

  function entries(ifd: number): Map<number, Uint8Array> {
    const map = new Map<number, Uint8Array>();
    const count = u16(ifd);
    if (count > 1000) return map;
    for (let i = 0; i < count; i++) {
      const e = ifd + 2 + i * 12;
      const tag = u16(e);
      const size = (TYPE_SIZES[u16(e + 2)] ?? 0) * u32(e + 4);
      if (size === 0 || size > t.length) continue;
      const at = size <= 4 ? e + 8 : u32(e + 8);
      if (at + size > t.length) continue;
      map.set(tag, t.subarray(at, at + size));
    }
    return map;
  }

  try {
    const ifd0 = entries(u32(4));
    const xp = ifd0.get(TAG_XP_KEYWORDS);
    if (xp) {
      out.xpKeywords = new TextDecoder("utf-16le").decode(xp).replace(/\0+$/, "");
    }
    const pointer = ifd0.get(TAG_EXIF_IFD);
    if (pointer && pointer.length === 4) {
      const exifIfd = new DataView(pointer.buffer, pointer.byteOffset, 4).getUint32(0, little);
      const original = entries(exifIfd).get(TAG_DATE_TIME_ORIGINAL);
      if (original) out.dateTimeOriginal = ascii(original, 0, original.length);
    }
  } catch {
    // Cut short: whatever was read.
  }
  return out;
}

// ---------------------------------------------------------------------------
// IPTC
// ---------------------------------------------------------------------------

type Iptc = { keywords: string[]; dateCreated: string | null };

/** IPTC-IIM: keywords (2:25) and the date created (2:55, CCYYMMDD). */
function readIptc(bytes: Uint8Array): Iptc {
  const out: Iptc = { keywords: [], dateCreated: null };
  const raw: [number, number, Uint8Array][] = [];
  let utf8Marked = false;
  let at = 0;
  while (at + 5 <= bytes.length && bytes[at] === 0x1c) {
    const record = bytes[at + 1];
    const dataset = bytes[at + 2];
    let length = (bytes[at + 3] << 8) | bytes[at + 4];
    let start = at + 5;
    if (length & 0x8000) {
      // An extended length, in the next (length & 0x7fff) bytes.
      const n = length & 0x7fff;
      if (n > 4) break;
      length = 0;
      for (let i = 0; i < n; i++) length = length * 256 + bytes[start + i];
      start += n;
    }
    const data = bytes.subarray(start, Math.min(start + length, bytes.length));
    // 1:90, the coded character set: ESC % G is UTF-8.
    if (record === 1 && dataset === 90) {
      utf8Marked = data[0] === 0x1b && data[1] === 0x25 && data[2] === 0x47;
    }
    raw.push([record, dataset, data]);
    at = start + length;
  }
  const decodeText = (data: Uint8Array) => {
    if (!utf8Marked) {
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(data);
      } catch {
        return Array.from(data, (b) => String.fromCharCode(b)).join("");
      }
    }
    return text(data);
  };
  for (const [record, dataset, data] of raw) {
    if (record !== 2) continue;
    if (dataset === 25) out.keywords.push(decodeText(data));
    else if (dataset === 55) out.dateCreated = ascii(data, 0, data.length);
  }
  return out;
}

// ---------------------------------------------------------------------------
// XMP
// ---------------------------------------------------------------------------

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const MWG_RS = "http://www.metadataworkinggroup.com/schemas/regions/";
const MPRI = "http://ns.microsoft.com/photo/1.2/t/RegionInfo#";
const MPREG = "http://ns.microsoft.com/photo/1.2/t/Region#";
const IPTC_EXT = "http://iptc.org/std/Iptc4xmpExt/2008-02-29/";
const DC = "http://purl.org/dc/elements/1.1/";
const LR = "http://ns.adobe.com/lightroom/1.0/";
const DIGIKAM = "http://www.digikam.org/ns/1.0/";
const MICROSOFT_PHOTO = "http://ns.microsoft.com/photo/1.0/";
const MEDIAPRO = "http://ns.iview-multimedia.com/mediapro/1.0/";
const EXIF_XMP = "http://ns.adobe.com/exif/1.0/";
const PHOTOSHOP = "http://ns.adobe.com/photoshop/1.0/";

/** Keyword trees, and the character each writes between a keyword and
 *  the one it's filed under. */
const HIERARCHIES: [ns: string, name: string, separator: string][] = [
  [LR, "hierarchicalSubject", "|"],
  [DIGIKAM, "TagsList", "/"],
  [MICROSOFT_PHOTO, "LastKeywordXMP", "/"],
  [MEDIAPRO, "CatalogSets", "|"],
];

/** A branch of a keyword tree whose leaves are people. */
const PEOPLE_BRANCHES = new Set([
  "people", "person", "persons", "faces", "face", "family", "families",
  "names", "who", "personen", "familie", "personnes", "famille", "persone",
  "famiglia", "personas", "familia", "pessoas", "família",
]);

type Property = { ns: string; name: string; value: string | XmlElement };

const is = (el: { ns: string; name: string }, ns: string, name: string) =>
  el.ns === ns && el.name === name;

/**
 * An RDF resource's properties, however they're written: as attributes on
 * it, as elements in it, or on an `rdf:Description` inside it (all three
 * turn up in the wild, the first two often mixed).
 */
function properties(node: XmlElement): Property[] {
  const out: Property[] = [];
  for (const a of node.attrs) {
    if (a.ns !== RDF && a.ns !== "" && !a.ns.startsWith("http://www.w3.org/XML/")) {
      out.push({ ns: a.ns, name: a.name, value: a.value });
    }
  }
  for (const child of node.children) {
    if (is(child, RDF, "Description")) out.push(...properties(child));
    else if (child.ns !== RDF) out.push({ ns: child.ns, name: child.name, value: child });
  }
  return out;
}

function property(props: Property[], ns: string, name: string) {
  return props.find((p) => p.ns === ns && p.name === name)?.value;
}

/** A property's items: the `rdf:li`s of a Bag, Seq or Alt inside it. */
function items(el: XmlElement): XmlElement[] {
  const container = el.children.find(
    (c) => c.ns === RDF && (c.name === "Bag" || c.name === "Seq" || c.name === "Alt"),
  );
  return container ? container.children.filter((c) => is(c, RDF, "li")) : [];
}

/** A property's text: an attribute's value, an element's text, or its
 *  first item's (an Alt's default language comes first). */
function textOf(value: string | XmlElement | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value.trim();
  const first = items(value)[0];
  return (first ? first.text : value.text).trim();
}

/** A property's texts: each item's, or its own when it has no items. */
function textsOf(value: string | XmlElement): string[] {
  if (typeof value === "string") return [value.trim()];
  const list = items(value);
  return (list.length > 0 ? list.map((li) => li.text) : [value.text]).map((s) =>
    s.trim(),
  );
}

/** Each element, and each attribute, named `ns`:`name`, anywhere. */
function everywhere(root: XmlElement, ns: string, name: string): (string | XmlElement)[] {
  const out: (string | XmlElement)[] = [];
  for (const el of descendants(root)) {
    if (is(el, ns, name)) out.push(el);
    for (const a of el.attrs) if (is(a, ns, name)) out.push(a.value);
  }
  return out;
}

/** Each `rdf:li` resource in a list-valued structure named `ns`:`name`. */
function listed(root: XmlElement, ns: string, name: string): Property[][] {
  return everywhere(root, ns, name).flatMap((v) =>
    typeof v === "string" ? [] : items(v).map(properties),
  );
}

type Xmp = {
  regions: string[];
  shown: string[];
  keywords: string[];
  trees: { path: string[] }[];
  dateTimeOriginal: string | null;
  dateCreated: string | null;
};

function readXmp(packet: string): Xmp {
  const root = parseXml(packet);
  const out: Xmp = {
    regions: [],
    shown: [],
    keywords: [],
    trees: [],
    dateTimeOriginal: null,
    dateCreated: null,
  };

  // Named face regions, MWG's: Regions > RegionList > Bag > li, each with
  // a Name and a Type (only faces, or regions with no type, are people).
  for (const region of listed(root, MWG_RS, "RegionList")) {
    const type = textOf(property(region, MWG_RS, "Type")).toLowerCase();
    if (type && type !== "face") continue;
    out.regions.push(textOf(property(region, MWG_RS, "Name")));
  }
  // Microsoft's: RegionInfo > Regions > Bag > li, each a PersonDisplayName.
  for (const region of listed(root, MPRI, "Regions")) {
    out.regions.push(textOf(property(region, MPREG, "PersonDisplayName")));
  }

  for (const v of everywhere(root, IPTC_EXT, "PersonInImage")) {
    out.shown.push(...textsOf(v));
  }
  for (const person of listed(root, IPTC_EXT, "PersonInImageWDetails")) {
    out.shown.push(textOf(property(person, IPTC_EXT, "PersonName")));
  }
  for (const v of everywhere(root, DC, "subject")) out.keywords.push(...textsOf(v));
  for (const [ns, name, separator] of HIERARCHIES) {
    for (const v of everywhere(root, ns, name)) {
      for (const path of textsOf(v)) {
        out.trees.push({ path: path.split(separator).map((s) => s.trim()) });
      }
    }
  }
  out.dateTimeOriginal = textOf(everywhere(root, EXIF_XMP, "DateTimeOriginal")[0]) || null;
  out.dateCreated = textOf(everywhere(root, PHOTOSHOP, "DateCreated")[0]) || null;
  return out;
}

// ---------------------------------------------------------------------------
// What it all says
// ---------------------------------------------------------------------------

/** A date as the photo wrote it — EXIF's "1987:06:05 10:11:12", XMP's
 *  "1987-06-05T10:11:12+01:00" or "1987", IPTC's "19870605" — as a partial
 *  ISO date, or null when it isn't a date a photo could have been taken on
 *  by `today`. Only the date is kept, as written: no time zone is applied. */
export function photoDate(raw: string | null | undefined, today: Date): string | null {
  if (!raw) return null;
  const m =
    /^\s*(\d{4})(?:[:-](\d{2})(?:[:-](\d{2}))?)?(?=$|[\sT])/.exec(raw) ??
    /^\s*(\d{4})(\d{2})(\d{2})\s*$/.exec(raw);
  if (!m) return null;
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) : 0;
  const day = m[3] && month ? Number(m[3]) : 0;
  if (year < FIRST_PHOTO_YEAR || month > 12) return null;
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  // Taken today somewhere ahead of this clock is still today.
  const latest = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (Date.UTC(year, Math.max(month, 1) - 1, Math.max(day, 1)) > latest) return null;
  if (!month) return String(year);
  if (!day) return `${year}-${pad(month)}`;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The earliest of the dates a photo gives, compared as finely as both
 *  are known; at a tie, the one known more finely. A scan carries the day
 *  it was scanned as well as the year someone wrote in: the photo is the
 *  older of the two. */
function earliest(dates: string[]): string | null {
  let best: string | null = null;
  for (const d of dates) {
    if (!best) {
      best = d;
      continue;
    }
    const shared = Math.min(best.length, d.length);
    const a = d.slice(0, shared);
    const b = best.slice(0, shared);
    if (a < b || (a === b && d.length > best.length)) best = d;
  }
  return best;
}

function interpret(found: Found, today: Date): PhotoMetadata {
  const names: PhotoName[] = [];
  const seen = new Map<string, number>();
  const add = (raw: string, source: PhotoNameSource) => {
    const name = raw.replace(/\s+/g, " ").trim();
    if (!name || name.length > NAME_LENGTH_MAX || names.length >= NAMES_MAX) return;
    const key = name.toLowerCase();
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, names.length);
      names.push({ name, source });
    }
  };

  const exif = found.tiff.map(readTiff);
  const iptc = found.iptc.map(readIptc);
  const xmp = found.xmp.map((packet) => {
    try {
      return readXmp(packet);
    } catch {
      return null;
    }
  }).filter((x): x is Xmp => x !== null);

  // Strongest first: a name added once keeps the first source it came with.
  for (const x of xmp) x.regions.forEach((n) => add(n, "region"));
  for (const x of xmp) x.shown.forEach((n) => add(n, "shown"));
  for (const x of xmp) {
    for (const { path } of x.trees) {
      const leaf = path[path.length - 1];
      const filed = path
        .slice(0, -1)
        .some((branch) => PEOPLE_BRANCHES.has(branch.toLowerCase()));
      if (leaf && filed) add(leaf, "people");
    }
  }
  for (const x of xmp) {
    x.keywords.forEach((n) => add(n, "keyword"));
    for (const { path } of x.trees) add(path[path.length - 1] ?? "", "keyword");
  }
  for (const i of iptc) i.keywords.forEach((n) => add(n, "keyword"));
  for (const e of exif) {
    e.xpKeywords?.split(";").forEach((n) => add(n, "keyword"));
  }

  const dates = [
    ...exif.map((e) => e.dateTimeOriginal),
    ...xmp.flatMap((x) => [x.dateTimeOriginal, x.dateCreated]),
    ...iptc.map((i) => iptcDate(i.dateCreated)),
  ]
    .map((raw) => photoDate(raw, today))
    .filter((d): d is string => d !== null);

  return { names, taken: earliest(dates) };
}

/** IPTC writes an unknown month or day as 00: "19620000" is 1962. */
function iptcDate(raw: string | null): string | null {
  const m = raw ? /^(\d{4})(\d{2})(\d{2})/.exec(raw) : null;
  if (!m) return null;
  if (m[2] === "00") return m[1];
  if (m[3] === "00") return `${m[1]}-${m[2]}`;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
