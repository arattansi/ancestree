import type * as React from "react";

import type { GlimpseLeaf, GlimpseRow } from "@/lib/invite-glimpse";
import { leafGeometry, MIDRIB } from "@/lib/leaf-shapes";
import { cn } from "@/lib/utils";

// In leaf units (`lib/leaf-shapes.ts`): a blade is 208 long, stem included,
// and 150 across its box. Each leaf stands up off its row's twig.
const LENGTH = 208;
const STEM = 46;
const CELL = 180;
const ROW_H = LENGTH + 40;
const PAD = 30;
/** The most a leaf is drawn across, in pixels: a small tree stays small. */
const MAX_CELL_PX = 24;

const GREEN = "var(--brand-green)";
const BROWN = "var(--brand-brown)";
const tint = (colour: string, percent: number) =>
  `color-mix(in srgb, ${colour} ${percent}%, var(--card))`;

const LOOK: Record<NonNullable<GlimpseLeaf["mark"]> | "none", { fill: string; line: string }> = {
  none: { fill: tint(GREEN, 18), line: GREEN },
  inviter: { fill: tint(GREEN, 90), line: GREEN },
  you: { fill: tint(BROWN, 75), line: BROWN },
};

/**
 * The join page's picture of the tree (Step 215): a leaf for everyone on
 * it, in rows by generation, nothing on any leaf. The inviter's is green,
 * and on a claim link the claimed one brown, as the key under it says.
 * Drawn on the server: each shape's outline goes in once and every leaf
 * of that shape uses it.
 */
export function TreeGlimpse({
  rows,
  inviterName,
  caption,
  className,
}: {
  rows: GlimpseRow[];
  /** First name, for the key. */
  inviterName: string;
  caption: string;
  className?: string;
}) {
  const cells = (row: GlimpseRow) =>
    row.leaves.length + (row.before ? 1 : 0) + (row.after ? 1 : 0);
  const wide = Math.max(1, ...rows.map(cells));
  const width = wide * CELL + PAD * 2;
  const height = rows.length * ROW_H - 40 + PAD * 2;
  const leaves = rows.flatMap((r) => r.leaves);
  const shapes = [...new Set(leaves.map((l) => l.shape))];
  // Each shape in each colour is drawn once, and every leaf uses it.
  const kinds = [...new Set(leaves.map(kindOf))];
  const marks = new Set(rows.flatMap((r) => r.leaves.map((l) => l.mark)));
  const people = rows.reduce((n, r) => n + r.leaves.length + r.before + r.after, 0);

  return (
    <figure
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-brand-green/25 bg-brand-green/5 px-3 py-4",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: `min(100%, ${(width / CELL) * MAX_CELL_PX}px)` }}
        className="h-auto overflow-visible"
        role="img"
        aria-label={`The tree: ${people} leaves in ${rows.length} ${rows.length === 1 ? "row" : "rows"}, one for each person, no names.`}
      >
        <defs>
          {shapes.map((shape) => (
            <path key={shape} id={`glimpse-${shape}`} d={leafGeometry(shape).blade} />
          ))}
          {kinds.map((kind) => {
            const [shape, mark] = kind.split(":");
            const look = LOOK[mark as keyof typeof LOOK];
            const href = `#glimpse-${shape}`;
            return (
              <g key={kind} id={`glimpse-${shape}-${mark}`}>
                <line x1={0} x2={STEM} y1={MIDRIB} y2={MIDRIB} stroke={BROWN} strokeWidth={12} strokeLinecap="round" />
                {/* The outline under the fill, at twice its width, so
                    overlapping leaflets read as one silhouette. */}
                <use href={href} fill="none" stroke={look.line} strokeWidth={22} strokeLinejoin="round" />
                <use href={href} style={{ fill: look.fill }} />
              </g>
            );
          })}
        </defs>
        {/* The trunk the rows branch off, behind them all. */}
        {rows.length > 1 ? (
          <line
            x1={width / 2}
            x2={width / 2}
            y1={PAD + LENGTH}
            y2={height - PAD + 30}
            stroke={BROWN}
            strokeWidth={16}
            strokeLinecap="round"
          />
        ) : null}
        {rows.map((row, r) => {
          const base = PAD + r * ROW_H + LENGTH;
          const left = PAD + (width - PAD * 2 - cells(row) * CELL) / 2;
          const firstLeaf = left + (row.before ? CELL : 0);
          const centre = (i: number) => firstLeaf + i * CELL + CELL / 2;
          return (
            <g key={r}>
              {/* The twig the row's leaves grow from. */}
              <line
                x1={centre(0) - CELL * 0.4}
                x2={centre(row.leaves.length - 1) + CELL * 0.4}
                y1={base}
                y2={base}
                stroke={BROWN}
                strokeWidth={12}
                strokeLinecap="round"
              />
              {row.leaves.map((leaf, i) => {
                // Every other leaf leans the other way, as on a branch.
                const lean = i % 2 === 0 ? -98 : -82;
                return (
                  <use
                    key={i}
                    href={`#glimpse-${kindOf(leaf).replace(":", "-")}`}
                    transform={`translate(${Math.round(centre(i))} ${base}) rotate(${lean}) translate(0 ${-MIDRIB})`}
                  />
                );
              })}
              {row.before ? (
                <text x={left + CELL / 2} y={base - LENGTH / 2} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground" fontSize={120}>
                  +{row.before}
                </text>
              ) : null}
              {row.after ? (
                <text x={centre(row.leaves.length)} y={base - LENGTH / 2} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground" fontSize={120}>
                  +{row.after}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-col items-center gap-1.5 text-center text-xs text-muted-foreground">
        {marks.has("inviter") || marks.has("you") ? (
          <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            {marks.has("inviter") ? <Key look={LOOK.inviter}>{inviterName}</Key> : null}
            {marks.has("you") ? <Key look={LOOK.you}>you</Key> : null}
          </span>
        ) : null}
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

/** A leaf's shape and colour, as its drawing in `<defs>` is named. */
const kindOf = (leaf: GlimpseLeaf) => `${leaf.shape}:${leaf.mark ?? "none"}`;

/** One entry of the key: a leaf-shaped swatch and whose it is. */
function Key({ look, children }: { look: { fill: string; line: string }; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-foreground">
      <span
        aria-hidden
        className="inline-block size-2.5 border"
        style={{ background: look.fill, borderColor: look.line, borderRadius: "0 80% 0 80%" }}
      />
      {children}
    </span>
  );
}
