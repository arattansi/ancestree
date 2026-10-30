import { leafGeometry, type LeafShape } from "@/lib/leaf-shapes";
import { cn } from "@/lib/utils";

/**
 * Someone's leaf, small, beside their name on a card's page or its tag: the
 * blade of their birthplace's tree (`nativeLeaf`), its midrib in trunk brown.
 */
export function CardLeaf({ shape, className }: { shape: LeafShape; className?: string }) {
  const { blade } = leafGeometry(shape);
  return (
    <svg
      viewBox="28 14 182 122"
      className={cn("h-[34px] w-[56px] shrink-0 overflow-visible", className)}
      aria-hidden
    >
      <path d={blade} className="fill-brand-green stroke-canopy" strokeWidth={3} strokeLinejoin="round" />
      <path d="M40,75 L199,75" fill="none" className="stroke-brand-brown" strokeOpacity={0.45} strokeWidth={3} />
    </svg>
  );
}
