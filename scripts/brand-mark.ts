/**
 * Draws the ancestree mark — a bushy tree lit from above, with one small apple
 * landed by its roots — and writes every file the brand ships as:
 *
 *   public/brand/ancestree-mark.svg       the mark; <LogoMark /> serves this
 *   public/brand/ancestree-mark-mono.svg  one-colour silhouette (currentColor)
 *   public/brand/ancestree-mark-512.png   for avatars and anywhere SVG isn't taken
 *   public/brand/ancestree-mark-132.png   the emails' logo (shown at 44px)
 *   app/icon.svg                          favicon (same drawing)
 *   app/favicon.ico                       16/32/48 fallback for older browsers
 *   app/apple-icon.png                    180px home-screen icon on cream
 *
 *   npm run brand:build
 *
 * The SVG is generated, not drawn by hand: edit the numbers here and re-run
 * rather than touching the output. A seeded random walk places the canopy's
 * clusters and leaves, so the same code always draws the same tree.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Where the sun sits, in degrees; -90 is straight overhead (SVG y runs down). */
const LIGHT_DEG = -90;

let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const f = (n: number) => +n.toFixed(2);
const g1 = (n: number) => +n.toFixed(1);
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) =>
  "#" +
  rgb(a)
    .map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, "0"))
    .join("");

/** A leafy cluster: a circle whose edge is a ring of round bumps. */
function puff(cx: number, cy: number, r: number, n: number, jitter = 0.07, rot = rnd() * 6.28, sx = 1) {
  const chord = 2 * r * Math.sin(Math.PI / n);
  const R = r - chord * 0.42;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * 2 * Math.PI;
    const k = 1 + (rnd() * 2 - 1) * jitter;
    pts.push([cx + R * sx * k * Math.cos(a), cy + R * k * Math.sin(a)]);
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    const ar = f(Math.hypot(x2 - x1, y2 - y1) * 0.56);
    d += `A${ar} ${ar} 0 0 1 ${f(x2)} ${f(y2)}`;
  }
  return d + "Z";
}

const LEAF = (len: number) =>
  `M0 ${f(-len)}C${f(len * 0.5)} ${f(-len * 0.45)} ${f(len * 0.42)} ${f(len * 0.45)} 0 ${f(len)}C${f(-len * 0.42)} ${f(len * 0.45)} ${f(-len * 0.5)} ${f(-len * 0.45)} 0 ${f(-len)}Z`;
const leafAt = (x: number, y: number, len: number, deg: number) =>
  `<use href="#at-leaf" transform="translate(${g1(x)} ${g1(y)}) rotate(${Math.round(deg)}) scale(${f(len)})"/>`;

// The canopy: a dome a little wider than tall, filled back to front.
type Layer = "back" | "mid" | "front";
type Puff = [cx: number, cy: number, r: number, bumps: number, layer: Layer];
const CX = 32;
const CY = 24.5;
const RR = 23.8;
const SX = 1.15;
const ring = (n: number, dist: number, r: number, bumps: number, layer: Layer, start: number): Puff[] =>
  Array.from({ length: n }, (_, i) => {
    const a = ((start + (i / n) * 360) * Math.PI) / 180;
    return [CX + dist * SX * Math.cos(a), CY + dist * Math.sin(a), r, bumps, layer];
  });
const PUFFS: Puff[] = [
  ...ring(9, 14, 9, 9, "back", -90),
  ...ring(6, 9.5, 7.5, 9, "mid", -120),
  [CX, CY - 2, 8, 10, "mid"],
  [25, 17, 7.4, 9, "front"],
  [39.5, 17.5, 7.2, 9, "front"],
  [19.5, 28, 6.6, 8, "front"],
  [44.5, 28.5, 6.6, 8, "front"],
  [32, 31.5, 7.2, 9, "front"],
  [32, 9.5, 6.8, 8, "front"],
];

// Each cluster is coloured by how squarely it faces the sun, between these
// two ends, so the light falls across the whole canopy rather than by layer.
const SUN = ["#c4ea93", "#8cc660", "#56953a", "#447f2d"];
const SHADE = ["#4f8a36", "#356b24", "#24501a", "#1d4414"];
const DEPTH: Record<Layer, number> = { back: -0.14, mid: 0, front: 0.06 };

const TRUNK =
  "M19.5 62.4C23.5 61.8 26.8 60 28 56.5 28.9 53.5 28.8 46 28.4 40H35.6C35.2 46 35.1 53.5 36 56.5 37.2 60 40.5 61.8 44.5 62.4 41 62.9 37.6 62.3 35.2 61.3 33.6 62.5 30.4 62.5 28.8 61.3 26.4 62.3 23 62.9 19.5 62.4Z";

// The apple is drawn in a 100-unit box resting on (50, 97), then scaled down
// and tipped over beside the trunk.
const APPLE = {
  body: "M50 22C58 14 78 12 88 28 98 44 95 72 83 86 75 95 63 98 56 96 53 95.3 47 95.3 44 96 37 98 25 95 17 86 5 72 2 44 12 28 22 12 42 14 50 22Z",
  stem: "M50 25C50 16 52 9 57 3",
  leaf: "M53 13C60 2 76 0 86 5 78 15 64 18 53 13Z",
  vein: "M55 12.5C63 9 72 7 82 6",
};
const APPLE_AT = `translate(44.2 62) rotate(14) scale(${f(5.6 / 92)}) translate(-50 -97)`;

const LEAFY_FILTER = `<filter id="at-leafy" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="4" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.4" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`;

function drawMark() {
  seed = 11;
  const la = (LIGHT_DEG * Math.PI) / 180;
  const L = [Math.cos(la), Math.sin(la)];
  const toward = Math.atan2(L[1], L[0]);
  const base = puff(CX, CY, RR, 20, 0.03, rnd() * 6.28, SX);
  const grads: string[] = [];
  const parts: string[] = [];
  const outlines: string[] = [];
  const clipUse = [`<use href="#at-dome-shape"/>`];
  const silhouette = [`<path d="${base}"/>`];

  PUFFS.forEach(([cx, cy, r, n, layer], i) => {
    const d = puff(cx, cy, r, n);
    silhouette.push(`<path d="${d}"/>`);
    outlines.push(`<path id="at-p${i}" d="${d}"/>`);
    clipUse.push(`<use href="#at-p${i}"/>`);

    const p = [(cx - CX) / (RR * SX * 0.75), (cy - CY) / (RR * 0.75)];
    const t = clamp(0.5 + 0.5 * (p[0] * L[0] + p[1] * L[1]) + DEPTH[layer]);
    const [h, m, lo, e] = SUN.map((c, k) => mix(SHADE[k], c, t));
    grads.push(
      `<radialGradient id="at-c${i}" cx="${f(0.5 + 0.12 * L[0])}" cy="${f(0.5 + 0.14 * L[1])}" r=".78" fx="${f(0.5 + 0.2 * L[0])}" fy="${f(0.5 + 0.24 * L[1])}"><stop offset="0" stop-color="${h}"/><stop offset=".45" stop-color="${m}"/><stop offset=".85" stop-color="${lo}"/><stop offset="1" stop-color="${e}"/></radialGradient>`,
    );

    // Leaves catching the sun on the side facing it, a few in shade opposite.
    const lit: string[] = [];
    const dim: string[] = [];
    const count = Math.round((layer === "back" ? 4 : 7) + 8 * t);
    for (let j = 0; j < count; j++) {
      const a = toward + (j / (count - 1) - 0.5) * 2.1 + (rnd() - 0.5) * 0.25;
      const rr = r * (0.55 + rnd() * 0.3);
      lit.push(leafAt(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.95 + rnd() * 0.45, rnd() * 360));
    }
    for (let j = 0; j < 4; j++) {
      const a = toward + Math.PI + (j - 1.5) * 0.45 + (rnd() - 0.5) * 0.2;
      const rr = r * (0.7 + rnd() * 0.15);
      dim.push(leafAt(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.2 + rnd() * 0.4, rnd() * 360));
    }
    const glow = puff(cx + L[0] * r * 0.28, cy + L[1] * r * 0.28, r * 0.5, Math.max(6, n - 3), 0.1);

    parts.push(
      [
        layer === "back"
          ? ""
          : `    <g clip-path="url(#at-canopy)"><use href="#at-p${i}" transform="translate(${f(-L[0] * 1.1)} ${f(-L[1] * 1.1 + 0.3)})" fill="#173a0e" opacity=".35"/></g>`,
        `    <use href="#at-p${i}" fill="url(#at-c${i})"/>`,
        `    <path d="${glow}" fill="${mix("#6aa548", "#c9ee9c", t)}" opacity="${f(0.2 + 0.4 * t)}"/>`,
        `    <g fill="${mix("#7fb85a", "#d6f3aa", t)}" opacity="${f(0.25 + 0.6 * t)}">${lit.join("")}</g>`,
        `    <g fill="#23501a" opacity=".45">${dim.join("")}</g>`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  });

  // Bark: highlight on the side facing the sun, core shadow on the other.
  const side = Math.abs(L[0]) < 0.15 ? 0 : Math.sign(L[0]);
  const bark =
    side === 0
      ? `<stop offset="0" stop-color="#6b4722"/><stop offset=".35" stop-color="#c6935a"/><stop offset=".55" stop-color="#a0733a"/><stop offset=".86" stop-color="#5c3d1a"/><stop offset="1" stop-color="#6f4a24"/>`
      : `<stop offset="0" stop-color="#7d5428"/><stop offset=".22" stop-color="#c6935a"/><stop offset=".5" stop-color="#a0733a"/><stop offset=".78" stop-color="#5c3d1a"/><stop offset=".92" stop-color="#6b4722"/><stop offset="1" stop-color="#7f5a2e"/>`;
  const barkDir = side > 0 ? `x1="1" x2="0"` : `x1="0" x2="1"`;
  const groove = side > 0 ? 0.5 : -0.5;
  const sunC = [f(0.5 + 0.36 * L[0]), f(0.5 + 0.42 * L[1])];

  const colour = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    ${grads.join("\n    ")}
    <radialGradient id="at-dome" cx="${sunC[0]}" cy="${sunC[1]}" r=".8"><stop offset="0" stop-color="#4f8c35"/><stop offset=".7" stop-color="#2f6420"/><stop offset="1" stop-color="#1f4715"/></radialGradient>
    <radialGradient id="at-sun" cx="${sunC[0]}" cy="${sunC[1]}" r=".6"><stop offset="0" stop-color="#fbffd6" stop-opacity=".28"/><stop offset=".6" stop-color="#fbffd6" stop-opacity=".08"/><stop offset="1" stop-color="#fbffd6" stop-opacity="0"/></radialGradient>
    <radialGradient id="at-shadow" cx="${sunC[0]}" cy="${sunC[1]}" r=".9"><stop offset=".45" stop-color="#0f2a08" stop-opacity="0"/><stop offset=".8" stop-color="#0f2a08" stop-opacity=".3"/><stop offset="1" stop-color="#0f2a08" stop-opacity=".55"/></radialGradient>
    <linearGradient id="at-bark" ${barkDir}>${bark}</linearGradient>
    <linearGradient id="at-shade" gradientUnits="userSpaceOnUse" x1="0" y1="44" x2="0" y2="54"><stop offset="0" stop-color="#1f1407" stop-opacity=".7"/><stop offset="1" stop-color="#1f1407" stop-opacity="0"/></linearGradient>
    <linearGradient id="at-roots" gradientUnits="userSpaceOnUse" x1="0" y1="58" x2="0" y2="62.6"><stop offset="0" stop-color="#1f1407" stop-opacity="0"/><stop offset="1" stop-color="#1f1407" stop-opacity=".45"/></linearGradient>
    <radialGradient id="at-ground"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <radialGradient id="at-apple" cx=".4" cy=".38" r=".7" fx=".34" fy=".3"><stop offset="0" stop-color="#ff8466"/><stop offset=".35" stop-color="#e8452c"/><stop offset=".8" stop-color="#b8261a"/><stop offset="1" stop-color="#8a1a10"/></radialGradient>
    <radialGradient id="at-apple-blush" cx=".5" cy=".12" r=".55"><stop offset="0" stop-color="#f7b24a" stop-opacity=".55"/><stop offset="1" stop-color="#f7b24a" stop-opacity="0"/></radialGradient>
    <radialGradient id="at-apple-cup" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#5c0f06" stop-opacity=".7"/><stop offset="1" stop-color="#5c0f06" stop-opacity="0"/></radialGradient>
    <radialGradient id="at-apple-shine" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".6" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="at-apple-stem" x1="0" x2="1"><stop offset="0" stop-color="#8a5a2b"/><stop offset="1" stop-color="#4a2c10"/></linearGradient>
    <linearGradient id="at-apple-leaf" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#4b8a32"/><stop offset="1" stop-color="#9fd06f"/></linearGradient>
    <radialGradient id="at-apple-ground"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <path id="at-leaf" d="${LEAF(1)}"/>
    <path id="at-dome-shape" d="${base}"/>
    ${outlines.join("\n    ")}
    <clipPath id="at-canopy">${clipUse.join("")}</clipPath>
    <clipPath id="at-trunk"><path d="${TRUNK}"/></clipPath>
    ${LEAFY_FILTER}
  </defs>
  <ellipse cx="${f(32 - 3 * L[0])}" cy="61.8" rx="19" ry="2.4" fill="url(#at-ground)"/>
  <path fill="url(#at-bark)" d="${TRUNK}"/>
  <g clip-path="url(#at-trunk)" fill="none" stroke-linecap="round">
    <path d="M30.2 41c.4 5-.4 9 .2 13.5s-1.2 5.5-3.4 7.5M32.6 40c-.3 6 .5 10 0 15s.6 5.2 1.2 7M34.4 41c.3 4.5-.2 8.5.4 13s2 5.2 4.8 7.2" stroke="#4a2f12" stroke-width=".55" opacity=".55"/>
    <path d="M30.2 41c.4 5-.4 9 .2 13.5s-1.2 5.5-3.4 7.5M32.6 40c-.3 6 .5 10 0 15s.6 5.2 1.2 7" transform="translate(${groove} 0)" stroke="#e3b47a" stroke-width=".35" opacity=".45"/>
    <ellipse cx="31.3" cy="52.5" rx=".7" ry="1.1" fill="#4a2f12" opacity=".5"/>
  </g>
  <path fill="url(#at-roots)" d="${TRUNK}"/>
  <path fill="url(#at-shade)" d="${TRUNK}"/>
  <g filter="url(#at-leafy)">
    <use href="#at-dome-shape" fill="url(#at-dome)"/>
${parts.join("\n")}
    <g clip-path="url(#at-canopy)">
      <rect x="0" y="0" width="64" height="50" fill="url(#at-shadow)"/>
      <rect x="0" y="0" width="64" height="50" fill="url(#at-sun)"/>
    </g>
  </g>

  <ellipse cx="44.5" cy="61.9" rx="3.08" ry=".67" fill="url(#at-apple-ground)"/>
  <g transform="${APPLE_AT}">
    <path fill="url(#at-apple)" d="${APPLE.body}"/>
    <path fill="url(#at-apple-blush)" d="${APPLE.body}"/>
    <path d="M30 34C24 48 24 66 32 82M70 30C80 44 82 64 74 82M50 30C46 50 47 70 50 90" stroke="#ff9a7a" stroke-width="1.6" fill="none" opacity=".16" stroke-linecap="round"/>
    <path d="M90.5 48C94 62 91 78 80 89" stroke="#ff6a4c" stroke-width="3.5" fill="none" opacity=".2" stroke-linecap="round"/>
    <ellipse cx="50" cy="24" rx="12" ry="5" fill="url(#at-apple-cup)"/>
    <ellipse cx="31" cy="42" rx="7" ry="12" transform="rotate(20 31 42)" fill="url(#at-apple-shine)"/>
    <circle cx="28.5" cy="36" r="2.4" fill="#fff" opacity=".85"/>
    <path d="${APPLE.stem}" stroke="url(#at-apple-stem)" stroke-width="4.5" stroke-linecap="round" fill="none"/>
    <path fill="url(#at-apple-leaf)" d="${APPLE.leaf}"/>
    <path d="${APPLE.vein}" stroke="#c8ec9e" stroke-width="1.2" fill="none" opacity=".7" stroke-linecap="round"/>
  </g>
</svg>
`;

  const mono = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="currentColor">
  <defs>
    ${LEAFY_FILTER}
  </defs>
  <path d="${TRUNK}"/>
  <g filter="url(#at-leafy)">
    ${silhouette.join("\n    ")}
  </g>
  <g transform="${APPLE_AT}">
    <path d="${APPLE.body}"/>
    <path d="${APPLE.stem}" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" fill="none"/>
    <path d="${APPLE.leaf}"/>
  </g>
</svg>
`;

  return { colour, mono };
}

/** A .ico holding PNGs, which every browser that still asks for one reads. */
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = header.length + entries.length;
  images.forEach(({ size, png }, i) => {
    entries.writeUInt8(size, i * 16);
    entries.writeUInt8(size, i * 16 + 1);
    entries.writeUInt16LE(1, i * 16 + 4);
    entries.writeUInt16LE(32, i * 16 + 6);
    entries.writeUInt32LE(png.length, i * 16 + 8);
    entries.writeUInt32LE(offset, i * 16 + 12);
    offset += png.length;
  });
  return Buffer.concat([header, entries, ...images.map((image) => image.png)]);
}

const png = (svg: string, size: number) =>
  sharp(Buffer.from(svg), { density: 1200 }).resize(size, size).png().toBuffer();

async function main() {
  const { colour, mono } = drawMark();
  const out = (path: string, data: string | Buffer) => {
    writeFileSync(join(ROOT, path), data);
    console.log(`wrote ${path}`);
  };

  out("public/brand/ancestree-mark.svg", colour);
  out("public/brand/ancestree-mark-mono.svg", mono);
  out("app/icon.svg", colour);
  out("public/brand/ancestree-mark-512.png", await png(colour, 512));
  out("public/brand/ancestree-mark-132.png", await png(colour, 132));

  // Full-bleed cream square: iOS rounds the corners itself.
  const inner = colour.replace(/^\s*<svg[^>]*>|<\/svg>\s*$/g, "");
  const apple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" fill="#fbf8f1"/><g transform="translate(18 18) scale(2.25)">${inner}</g></svg>`;
  out("app/apple-icon.png", await png(apple, 180));

  const sizes = [16, 32, 48];
  out("app/favicon.ico", ico(await Promise.all(sizes.map(async (size) => ({ size, png: await png(colour, size) })))));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
