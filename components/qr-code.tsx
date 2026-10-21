import * as React from "react";
import { encode as encodeQr } from "uqr";

import { cn } from "@/lib/utils";

/** A QR code, drawn as one path: the messenger's link to another device
 *  (Step 174) and /android's way onto a phone (Step 200). */
export function QrCode({
  text,
  label,
  className,
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const { size, data } = React.useMemo(() => encodeQr(text, { ecc: "M", border: 2 }), [text]);
  const d = data
    .flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : "")))
    .join("");
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      className={cn("size-48 rounded-md bg-white", className)}
      shapeRendering="crispEdges"
    >
      <path d={d} fill="#000" />
    </svg>
  );
}
