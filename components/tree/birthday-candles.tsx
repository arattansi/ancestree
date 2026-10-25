import { CANDLE } from "@/lib/candles";
import { cn } from "@/lib/utils";

type XY = { x: number; y: number };

/** Each candle's stripes in turn: the apples' red, the leaves' green. */
const STRIPES = ["var(--brand-red)", "var(--brand-green)"];

/** A flame drawn in a box its own size: a point at the top, round below. */
const FLAME = `M3.5 0C4.6 2.6 7 4.6 7 6.6A3.5 3.4 0 0 1 0 6.6C0 4.6 2.4 2.6 3.5 0Z`;
const CORE = `M3.5 3.6C4.1 5 5.1 6 5.1 7.1A1.6 1.6 0 0 1 1.9 7.1C1.9 6 2.9 5 3.5 3.6Z`;

/**
 * Birthday candles (Step 205), stood on a card turned cake or stuck into a
 * leaf: a striped stick, its wick, and a flame that sways a little about
 * its foot, each candle a beat after the one before. Each foot is in the
 * card's own pixels (`lib/candles.ts`).
 *
 * The flames are elements of their own, so the browser moves them without
 * painting the card again; they hold still for anyone whose system asks
 * for less motion, and off a spotlight's line (`still`).
 */
export function BirthdayCandles({
  feet,
  still = false,
}: {
  feet: readonly XY[];
  still?: boolean;
}) {
  const { width, stick, wick, flameWidth, flameHeight } = CANDLE;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {feet.map(({ x, y }, i) => (
        <div key={i}>
          <span
            className="absolute rounded-[1.5px] shadow-[inset_0_0_0_0.5px_rgba(38,32,22,0.25)]"
            style={{
              left: x - width / 2,
              top: y - stick,
              width,
              height: stick,
              background: `repeating-linear-gradient(-55deg, ${STRIPES[i % STRIPES.length]} 0 2px, var(--brand-cream) 2px 4.5px)`,
            }}
          />
          <span
            className="absolute bg-foreground/70"
            style={{
              left: x - 0.5,
              top: y - stick - wick,
              width: 1,
              height: wick + 0.5,
            }}
          />
          <svg
            viewBox={`0 0 ${flameWidth} ${flameHeight}`}
            className={cn(
              "absolute origin-bottom overflow-visible drop-shadow-[0_0_3px_rgba(255,176,46,0.75)] phone:filter-none",
              !still &&
                "will-change-transform motion-safe:animate-[candle-flicker_1.8s_ease-in-out_infinite]",
            )}
            style={{
              left: x - flameWidth / 2,
              top: y - stick - wick - flameHeight + 1,
              width: flameWidth,
              height: flameHeight,
              // Out of step with each other, as real flames are.
              animationDelay: `${-i * 0.55}s`,
              animationDuration: `${1.6 + i * 0.25}s`,
            }}
          >
            <path d={FLAME} fill="#f7a531" />
            <path d={CORE} fill="#ffe8a3" />
          </svg>
        </div>
      ))}
    </div>
  );
}
