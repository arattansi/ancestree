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
