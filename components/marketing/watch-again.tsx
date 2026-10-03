import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Plays a /features sample again once it has played (Step 115). */
export function WatchAgain({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={onClick}
      className={cn("animate-[leaf-settle_300ms_ease-out_both]", className)}
    >
      <RotateCcw aria-hidden />
      watch again
    </Button>
  );
}
