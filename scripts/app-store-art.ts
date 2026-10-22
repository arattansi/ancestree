/**
 * Draws the iPhone app's two App Store creative assets (Step 201), the
 * placements App Store Connect added on 2026-10-05:
 *
 *   docs/app-store/header.png         product page header, 21:9, 3840 × 1646
 *   docs/app-store/search-result.png  search results, 3:2, 3840 × 2560
 *
 *   npm run store:art               (-- --guides also writes copies with
 *                                     Apple's art safe area drawn on, to a
 *                                     temporary folder it names)
 *
 * Both are drawn from the app's own geometry, as the mark is from
 * `scripts/brand-mark.ts`: the header is the home page's Elevators family
 * (`lib/elevators-tree.ts`) as the web draws leaf cards, around the tagline;
 * the search result is the iPhone's leaf view (`lib/leaf-orbit.ts`,
 * `lib/leaf-ghosts.ts`) on Nila from the review family
 * (`scripts/app-review-account.ts`). Edit here and re-run rather than
 * touching the PNGs.
 *
 * Each is a page of SVG and HTML that Chrome photographs headless (`CHROME`
 * names another browser); Public Sans comes from Google Fonts, as the link
 * preview's does. App Store Connect refuses an alpha channel, so sharp
 * flattens the result onto cream. Apple's templates mark only a centred art
 * safe area (`SAFE` below): what matters sits inside it, and everything
 * outside it can be cropped on some device. Check both in App Store
 * Connect's Preview after an upload.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

import {
  descentGeometry,
  leafBranchPath,
  leafLandX,
  roundedPolyline,
  siblingBracketPoints,
  type CardRect,
} from "@/lib/edge-geometry";
import { ELEVATORS_COUPLES, ELEVATORS_FAMILIES, ELEVATORS_PEOPLE, ELEVATORS_SIBLINGS } from "@/lib/elevators-tree";
import { ghostLayout, shiftOrbit } from "@/lib/leaf-ghosts";
import { orbitLayout, orbitLines, type OrbitSide } from "@/lib/leaf-orbit";
import { BLADE_OVERHANG, inside, leafGeometry, MIDRIB, polygons, type LeafShape } from "@/lib/leaf-shapes";
import { nativeLeaf } from "@/lib/native-leaf";
import { COUPLE_GAP, GUTTER, NODE_H, NODE_W } from "@/lib/tree-dimensions";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const GUIDES = process.argv.includes("--guides");

/** `--brand-cream` and the tokens the leaf view uses (mobile/src/theme.ts). */
const CREAM = "#fbf8f1";
const INK = "#0a0a0a";
const MUTED = "#737373";
const GREEN = "#77b255";
const BROWN = "#a57939";
const PILL = "#e8e8e8";
const PILL_EDGE = "#d6d6d6";
const PILL_INK = "#525252";

type XY = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
let clips = 0;

/**
 * A leaf's blade with its stem in from the left, its 208 × 150 box at `at`
 * and `scale` pixels a box unit: outline under the fills, white, a green
 * wash, the species' veins (leaf-card.tsx, mobile/src/leaf/leaf.tsx).
 */
function leafSvg(
  shape: LeafShape,
  at: XY,
  scale: number,
  o: { stroke: number; wash: number; shadow?: boolean },
) {
  const g = leafGeometry(shape);
  const id = `clip${clips++}`;
  const bx = o.stroke / 2;
  const by = BLADE_OVERHANG + o.stroke / 2;
  const shadow = o.shadow
    ? `;filter:drop-shadow(0 ${8 * scale}px ${18 * scale}px rgba(38,32,22,0.22))`
    : "";
  return `<svg style="position:absolute;left:${at.x - bx * scale}px;top:${at.y - by * scale}px;overflow:visible${shadow}"
    width="${(208 + 2 * bx) * scale}" height="${(150 + 2 * by) * scale}" viewBox="${-bx} ${-by} ${208 + 2 * bx} ${150 + 2 * by}">
    <defs><clipPath id="${id}"><path d="${g.blade}"/></clipPath></defs>
    <path d="M0,${MIDRIB} L46,${MIDRIB}" stroke="${BROWN}" stroke-width="4" stroke-linecap="round" fill="none"/>
    <path d="${g.blade}" fill="none" stroke="${GREEN}" stroke-width="${o.stroke}" stroke-linejoin="round"/>
    <path d="${g.blade}" fill="#fff"/>
    <path d="${g.blade}" fill="${GREEN}" fill-opacity="${o.wash}"/>
    <g clip-path="url(#${id})" opacity="${g.veinOpacity}">${g.veins
      .map((d) => `<path d="${d}" stroke="${BROWN}" stroke-width="1" stroke-linecap="round" fill="none"/>`)
      .join("")}</g>
  </svg>`;
}

/** Apple's art safe area, drawn only with --guides. */
const guide = (b: Box) =>
  GUIDES
    ? `<div class="abs" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;outline:6px solid #00e000;background:rgba(0,224,0,.08)"></div>`
    : "";

/**
 * The page Chrome photographs. A line marked `data-fit` too long for its room
 * shrinks to fit, to that fraction of its size at least, as iOS's
 * `adjustsFontSizeToFit` does; the page says when it's ready.
 */
function page(w: number, h: number, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600&display=block" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;overflow:hidden;background:${CREAM}}
body{position:relative;font-family:'Public Sans',sans-serif;color:${INK};-webkit-font-smoothing:antialiased}
.abs{position:absolute}</style></head><body>${body}
<script>
document.fonts.ready.then(() => {
  for (const el of document.querySelectorAll('[data-fit]')) {
    const max = parseFloat(getComputedStyle(el).fontSize);
    let size = max;
    while (el.scrollWidth > el.clientWidth + 0.5 && size > max * parseFloat(el.dataset.fit)) {
      el.style.fontSize = (size -= 0.5) + 'px';
    }
  }
});
</script></body></html>`;
}

// ---------------------------------------------------------------------------
// Search result: the leaf view on Nila Mehta, as her daughter Asha (the
// review account) sees it, so the caption says "Your mother". Her parents'
// parents and her children's children are made up for the ghosts, which
// show no names.

type Relative = { first: string; last: string; deceased?: boolean; self?: boolean };

const RELATIVES: Record<string, Relative> = {
  ramnik: { first: "Ramnik", last: "Kapadia", deceased: true },
  savita: { first: "Savita", last: "Kapadia", deceased: true },
  kiran: { first: "Kiran", last: "Mehta" },
  hasmukh: { first: "Hasmukh", last: "Kapadia" },
  asha: { first: "Asha", last: "Mehta", self: true },
  rohan: { first: "Rohan", last: "Mehta" },
};
const PARENTS_OF: Record<string, string[]> = {
  nila: ["ramnik", "savita"],
  ramnik: ["g1", "g2"],
  savita: ["g3", "g4"],
  g1: ["gg1"],
  g3: ["gg2", "gg3"],
};
const CHILDREN_OF: Record<string, string[]> = {
  nila: ["asha", "rohan"],
  asha: ["c1", "c2"],
  rohan: ["c3"],
  c1: ["cc1"],
};

function searchResult(W: number, H: number) {
  const SAFE: Box = { x: 836, y: 765, w: 2168, h: 1030 };
  // An iPhone Pro Max's width, tall enough for every ghost.
  const frame = { width: 430, height: 720 };
  const orbit = orbitLayout(frame, {
    parents: PARENTS_OF.nila,
    children: CHILDREN_OF.nila,
    spouses: ["kiran"],
    siblings: ["hasmukh"],
  });
  const ghosts = ghostLayout(
    orbit,
    frame,
    { parentsOf: (id) => PARENTS_OF[id] ?? [], childrenOf: (id) => CHILDREN_OF[id] ?? [] },
    new Set(["nila", ...Object.keys(RELATIVES)]),
  );
  const layout = shiftOrbit(orbit, ghosts.shift);
  const native = nativeLeaf({ city_of_birth: "Mombasa", country_of_birth: "Kenya" });
  const g = leafGeometry(native.shape);
  const k = layout.leaf.width / 208;

  // Where each group's lines leave the blade (leafAnchors in
  // mobile/src/leaf/leaf.tsx).
  const blade = polygons(g.blade);
  let tip = 104;
  for (let x = 208; x > 104; x--) {
    if (inside(blade, { x, y: MIDRIB })) {
      tip = x;
      break;
    }
  }
  const onLeaf = (p: XY) => ({ x: layout.leaf.x + p.x * k, y: layout.leaf.y + p.y * k });
  const anchors: Record<OrbitSide, XY> = {
    parents: onLeaf({ x: 104, y: g.top }),
    children: onLeaf({ x: 104, y: g.bottom }),
    spouses: onLeaf({ x: 0, y: MIDRIB }),
    siblings: onLeaf({ x: tip, y: MIDRIB }),
  };
  const lines = orbitLines(layout, anchors);

  // The leaf and its pills fill the safe area; the ghosts, the caption and
  // the descriptor lie past it.
  const { width: pw, height: ph } = layout.pill;
  const xs = layout.pills.flatMap((p) => [p.x - pw / 2, p.x + pw / 2]);
  const ys = layout.pills.flatMap((p) => [p.y - ph / 2, p.y + ph / 2]);
  const core = {
    x0: Math.min(...xs, layout.leaf.x),
    x1: Math.max(...xs, layout.leaf.x + layout.leaf.width),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
  };
  const s = Math.min(SAFE.w / (core.x1 - core.x0), SAFE.h / (core.y1 - core.y0));
  const ox = W / 2 - ((core.x0 + core.x1) / 2) * s;
  const oy = H / 2 - ((core.y0 + core.y1) / 2) * s;
  const P = (p: XY) => ({ x: ox + p.x * s, y: oy + p.y * s });
  const midX = P({ x: layout.leaf.x + layout.leaf.width / 2, y: 0 }).x;

  // The ground's dots, a little fainter on cream.
  const dot = 20 * s;
  const ground = `<svg class="abs" style="left:0;top:0" width="${W}" height="${H}"><defs><pattern id="dots" width="${dot}" height="${dot}" patternUnits="userSpaceOnUse" x="${ox % dot}" y="${oy % dot}"><circle cx="${dot / 2}" cy="${dot / 2}" r="${0.7 * s}" fill="#91919a" fill-opacity="0.5"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#dots)"/></svg>`;

  // The ghosts (mobile/src/leaf/ghosts.tsx): smaller pills, blurred and
  // fainter each generation out, their lines faint, a stub fading past the
  // last generation.
  const BLUR = [1.4, 1.9];
  const OPACITY = [0.55, 0.3];
  const lineOpacity = (d: number) => (d <= 1 ? 0.4 : d === 2 ? 0.25 : 0.18);
  const ghostSvg = `<svg class="abs" style="left:0;top:0" width="${W}" height="${H}">
    <defs>
      ${BLUR.map((b, i) => `<filter id="blur${i + 1}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${b * s}"/></filter>`).join("")}
      ${ghosts.stubs
        .map((stub, i) => {
          const a = P(stub.from);
          const b = P(stub.to);
          return `<linearGradient id="stub${i}" gradientUnits="userSpaceOnUse" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"><stop offset="0" stop-color="${BROWN}" stop-opacity="${lineOpacity(stub.depth)}"/><stop offset="1" stop-color="${BROWN}" stop-opacity="0"/></linearGradient>`;
        })
        .join("")}
    </defs>
    ${ghosts.lines
      .map((l) => `<path d="${roundedPolyline(l.points.map(P), 6 * s)}" stroke="${BROWN}" stroke-opacity="${lineOpacity(l.depth)}" stroke-width="${1.5 * s}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`)
      .join("")}
    ${ghosts.stubs
      .map((stub, i) => {
        const a = P(stub.from);
        const b = P(stub.to);
        return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="url(#stub${i})" stroke-width="${1.5 * s}" stroke-linecap="round"/>`;
      })
      .join("")}
    ${ghosts.ghosts
      .map((ghost) => {
        const { width, height } = ghosts.sizes[ghost.depth - 1];
        const c = P({ x: ghost.x - width / 2, y: ghost.y - height / 2 });
        const w = width * s;
        const h = height * s;
        const disc = (height - 6) * s;
        const smudge = height * 0.22 * s;
        return `<g opacity="${OPACITY[ghost.depth - 1] ?? 0.3}" filter="url(#blur${Math.min(ghost.depth, 2)})">
          <rect x="${c.x}" y="${c.y}" width="${w}" height="${h}" rx="${h / 2}" fill="${PILL}"/>
          <rect x="${c.x + h * 0.4}" y="${c.y + h / 2 - smudge / 2}" width="${w * 0.36}" height="${smudge}" rx="${smudge / 2}" fill="${MUTED}"/>
          <circle cx="${c.x + w - 3 * s - disc / 2}" cy="${c.y + h / 2}" r="${disc / 2}" fill="${PILL_INK}"/>
        </g>`;
      })
      .join("")}
  </svg>`;

  // Lines 2.5 wide with rounded corners, in brown (spotlight.tsx).
  const lineSvg = `<svg class="abs" style="left:0;top:0" width="${W}" height="${H}">${lines
    .map((l) => `<path d="${roundedPolyline(l.points.map(P), 8 * s)}" stroke="${BROWN}" stroke-width="${2.5 * s}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`)
    .join("")}</svg>`;

  // The leaf, name and lines on its blade.
  const at = P(layout.leaf);
  const ks = k * s;
  const textLeft = g.textLeft * ks;
  const line = (text: string, size: number, css: string, fit: number) =>
    `<div data-fit="${fit}" style="font-size:${size}px;line-height:1.2;white-space:nowrap;overflow:hidden;${css}">${esc(text)}</div>`;
  const leaf =
    leafSvg(native.shape, at, ks, { stroke: 4, wash: 0.2 }) +
    `<div class="abs" style="left:${at.x + textLeft}px;top:${at.y}px;width:${(208 - 32) * ks - textLeft}px;height:${150 * ks}px;display:flex;flex-direction:column;justify-content:center">
      ${line("Nila Mehta", 17 * ks, "font-weight:600", 0.6)}
      ${line("née Kapadia", 13 * ks, `color:${MUTED};margin-top:${2 * ks}px`, 0.7)}
      ${line("b. 1961", 13 * ks, `color:${MUTED};margin-top:${2 * ks}px`, 0.7)}
    </div>`;

  // A gray pill each, the first name and the initials cut out of a dark disc
  // (person-pill.tsx): a dashed edge for someone who has died, a dark one
  // for the member's own.
  const textSize = Math.round(13 * Math.min(1, ph / 32) * 2) / 2;
  const pills = layout.pills
    .map((p) => {
      const who = RELATIVES[p.id ?? ""];
      const c = P({ x: p.x - pw / 2, y: p.y - ph / 2 });
      const h = ph * s;
      const disc = (ph - 7) * s;
      return `<div class="abs" style="left:${c.x}px;top:${c.y}px;width:${pw * s}px;height:${h}px;border-radius:${h / 2}px;background:${PILL};border:${0.75 * s}px ${who.deceased ? "dashed" : "solid"} ${who.self ? INK : PILL_EDGE};display:flex;align-items:center;padding-left:${10 * s}px;padding-right:${2 * s}px;gap:${3 * s}px">
        <span data-fit="0.7" style="flex:1;min-width:0;font-weight:500;font-size:${textSize * s}px;color:${who.deceased ? MUTED : INK};white-space:nowrap;overflow:hidden">${esc(who.first)}</span>
        <span style="flex:none;width:${disc}px;height:${disc}px;border-radius:50%;background:${PILL_INK};opacity:${who.deceased ? 0.7 : 1};display:flex;align-items:center;justify-content:center;font-weight:600;font-size:${disc * 0.42}px;letter-spacing:${0.2 * s}px;color:${PILL}">${who.first[0]}${who.last[0]}</span>
      </div>`;
    })
    .join("");

  // The caption over everything drawn (Step 185).
  const captionY = P({ x: 0, y: ghosts.top - 34 }).y;
  const caption = `<div class="abs" style="left:${midX - 600}px;width:1200px;top:${captionY}px;text-align:center;font-size:${15 * s}px;line-height:${20 * s}px;color:${MUTED}">Your mother</div>`;

  // What the leaf is, in its small pill under everything (Step 199,
  // descriptor.tsx), the leaf in miniature beside it.
  const points = blade.flat();
  const glyph = {
    y: Math.min(...points.map((p) => p.y)),
    w: Math.max(...points.map((p) => p.x)),
    h: Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
  };
  const lowest = Math.max(
    core.y1,
    ...ghosts.ghosts.map((ghost) => ghost.y + ghosts.sizes[ghost.depth - 1].height / 2),
  );
  const descriptor = `<div class="abs" style="left:${midX - 600}px;width:1200px;top:${P({ x: 0, y: lowest + 40 }).y}px;display:flex;justify-content:center">
    <div style="height:${28 * s}px;border-radius:${14 * s}px;background:${PILL};border:${0.75 * s}px solid ${PILL_EDGE};padding:0 ${12 * s}px 0 ${9 * s}px;display:flex;align-items:center;gap:${6 * s}px;font-size:${13 * s}px;color:${MUTED};white-space:nowrap">
      <svg width="${22 * s}" height="${Math.min((22 * glyph.h) / glyph.w, 20) * s}" viewBox="0 ${glyph.y} ${glyph.w} ${glyph.h}"><path d="M0,${MIDRIB} L46,${MIDRIB}" stroke="${BROWN}" stroke-width="10" stroke-linecap="round"/><path d="${g.blade}" fill="${GREEN}"/></svg>
      <span><span style="font-weight:500;color:${INK}">${esc(native.species ?? "")}</span> · ${esc(native.region ?? "")}</span>
    </div>
  </div>`;

  return page(W, H, ground + ghostSvg + lineSvg + leaf + pills + caption + descriptor + guide(SAFE));
}

// ---------------------------------------------------------------------------
// Product page header: the tagline in the safe area, and the Elevators
// family either side of it as the canvas draws a family: your momma and
// poppa over you and your sis on the left (me beside you, off the edge),
// your auntie and unc over your cousin and their boo over their kids on the
// right, the sisters' bracket across the top. Nothing crosses the words.

function header(W: number, H: number) {
  const SAFE: Box = { x: 1097, y: 493, w: 1646, h: 661 };
  // Pixels a canvas pixel.
  const s = 1.75;
  const width = W / s;
  const top = 64;
  const base = H / s - 64 - NODE_H;
  const pair = (mid: number) => [mid - COUPLE_GAP / 2 - NODE_W, mid + COUPLE_GAP / 2];
  const siblings = (mid: number) => [mid - GUTTER / 2 - NODE_W, mid + GUTTER / 2];

  // Each side's inner leaves reach a little way into the safe area's
  // flanks, clear of the words, so a crop to it still shows the tree.
  const leftTrunk = 448;
  const rightTrunk = width - leftTrunk;
  const cousinsTrunk = rightTrunk + 96;
  const [momma, poppa] = pair(leftTrunk);
  const [you, sis] = siblings(leftTrunk);
  const [auntie, unc] = pair(rightTrunk);
  const [cousin, boo] = pair(cousinsTrunk);
  const [niece, nephew] = siblings(cousinsTrunk);
  const at: Record<string, XY> = {
    momma: { x: momma, y: top },
    poppa: { x: poppa, y: top },
    auntie: { x: auntie, y: top },
    unc: { x: unc, y: top },
    me: { x: you - COUPLE_GAP - NODE_W, y: base },
    you: { x: you, y: base },
    sis: { x: sis, y: base },
    cousin: { x: cousin, y: (top + base) / 2 },
    "cousins-boo": { x: boo, y: (top + base) / 2 },
    niece: { x: niece, y: base },
    nephew: { x: nephew, y: base },
  };
  const leaves = ELEVATORS_PEOPLE.map((p) => ({
    p,
    shape: nativeLeaf({ city_of_birth: p.city, country_of_birth: p.country }).shape,
  }));
  const shapeOf = (id: string) => leaves.find(({ p }) => p.id === id)!.shape;
  const cardOf = (id: string): CardRect => ({ ...at[id], w: NODE_W, h: NODE_H });
  // leaf-card.tsx: the blade box overhangs its card by 19.
  const OVERHANG = 19;

  // Routed as the home page routes them (elevators-tree.tsx).
  const branches = [
    ...ELEVATORS_COUPLES.map(([a, b]) => {
      const [l, r] = [cardOf(a), cardOf(b)];
      const y = l.y + l.h / 2;
      return `M ${l.x + l.w},${y} L ${r.x},${y}`;
    }),
    ...ELEVATORS_FAMILIES.flatMap(({ parents, children }) => {
      const kids = children.map(cardOf);
      const descent = descentGeometry(parents.map(cardOf), Math.min(...kids.map((c) => c.y)), {
        leafy: true,
      });
      if (!descent) return [];
      const landXs = kids.length > 1 ? kids.map(leafLandX) : [];
      return kids.map((kid, i) =>
        leafBranchPath(descent, kid, leafGeometry(shapeOf(children[i])).top - OVERHANG, 10, landXs),
      );
    }),
  ];
  const brackets = ELEVATORS_SIBLINGS.map(([a, b]) =>
    roundedPolyline(siblingBracketPoints(cardOf(a), cardOf(b)), 10),
  );
  const lineSvg = `<svg class="abs" style="left:0;top:0;overflow:visible" width="${W}" height="${H}" viewBox="0 0 ${width} ${H / s}">
    ${branches.map((d) => `<path d="${d}" fill="none" stroke="${BROWN}" stroke-width="3" stroke-linecap="round"/>`).join("")}
    ${brackets.map((d) => `<path d="${d}" fill="none" stroke="${BROWN}" stroke-width="3" stroke-dasharray="6 6" stroke-linecap="round"/>`).join("")}
  </svg>`;

  // The web's leaf cards, each saying how they're related.
  const cards = leaves
    .map(({ p, shape }) => {
      const c = at[p.id];
      const textLeft = leafGeometry(shape).textLeft;
      return (
        leafSvg(shape, { x: c.x * s, y: (c.y - OVERHANG) * s }, s, { stroke: 3, wash: 0.18, shadow: true }) +
        `<div class="abs" style="left:${(c.x + textLeft) * s}px;top:${c.y * s}px;width:${(NODE_W - 32 - textLeft) * s}px;height:${NODE_H * s}px;display:flex;flex-direction:column;justify-content:center">
          <div style="font-weight:500;font-size:${13 * s}px;line-height:${15 * s}px;white-space:nowrap">${esc(p.label)}</div>
        </div>`
      );
    })
    .join("");

  const words = `<div class="abs" style="left:${SAFE.x}px;top:${SAFE.y}px;width:${SAFE.w}px;height:${SAFE.h}px;display:flex;align-items:center;justify-content:center;text-align:center">
    <div style="font-weight:600;font-size:164px;line-height:1.06;letter-spacing:-0.025em">the family tree<br>you grow together.</div>
  </div>`;
  return page(W, H, lineSvg + cards + words + guide(SAFE));
}

// ---------------------------------------------------------------------------

/** Chrome's own headless screenshot, in a throwaway profile. */
function photograph(html: string, w: number, h: number, dir: string): Buffer {
  const file = join(dir, `page-${w}x${h}.html`);
  const shot = join(dir, `shot-${w}x${h}.png`);
  writeFileSync(file, html);
  execFileSync(
    CHROME,
    [
      "--headless",
      `--user-data-dir=${join(dir, "profile")}`,
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${w},${h}`,
      // Time for the fonts to load and the lines to fit.
      "--virtual-time-budget=15000",
      `--screenshot=${shot}`,
      pathToFileURL(file).href,
    ],
    { stdio: "ignore" },
  );
  return readFileSync(shot);
}

async function main() {
  const work = mkdtempSync(join(tmpdir(), "app-store-art-"));
  const out = GUIDES ? work : join(ROOT, "docs/app-store");
  mkdirSync(out, { recursive: true });
  const assets = [
    { name: "header", w: 3840, h: 1646, html: header(3840, 1646) },
    { name: "search-result", w: 3840, h: 2560, html: searchResult(3840, 2560) },
  ];
  for (const { name, w, h, html } of assets) {
    const path = join(out, `${name}${GUIDES ? "-guides" : ""}.png`);
    await sharp(photograph(html, w, h, work))
      .flatten({ background: CREAM })
      .removeAlpha()
      .png()
      .toFile(path);
    console.log(`wrote ${GUIDES ? path : `docs/app-store/${name}.png`}`);
  }
  if (!GUIDES) rmSync(work, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
