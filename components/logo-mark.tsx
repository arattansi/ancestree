import type * as React from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The ancestree mark: the 🌳 emoji's bushy tree, drawn from scratch so it is
 * ours rather than any platform's emoji artwork, with one small apple landed
 * by the trunk. It didn't fall far.
 *
 * The drawing is public/brand/ancestree-mark.svg, generated with the favicon
 * and the other brand files by scripts/brand-mark.ts (npm run brand:build).
 * It is shaded with gradients whose ids would collide if it were inlined
 * twice on a page, so it is served as a file instead.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/ancestree-mark.svg"
      alt=""
      width={64}
      height={64}
      loading="eager"
      className={cn("shrink-0", className)}
    />
  );
}

/** Says so wherever the mark marks someone with an account. */
export const MEMBER_LABEL = "Ancestree member";

/**
 * The mark in small, on a leaf or card on My Family Tree: this entry has
 * been claimed, and the person it describes has an account. A plain <img>
 * of the same file the header's mark already loaded, so the dozens of
 * leaves that wear it fetch nothing more.
 */
export function MemberMark({
  className,
  style,
}: {
  className?: string;
  /** For placement worked out at render time, like a leaf's depth. */
  style?: React.CSSProperties;
}) {
  return (
    <img
      src="/brand/ancestree-mark.svg"
      alt={MEMBER_LABEL}
      title={MEMBER_LABEL}
      width={16}
      height={16}
      draggable={false}
      className={cn("shrink-0 select-none", className)}
      style={style}
    />
  );
}
