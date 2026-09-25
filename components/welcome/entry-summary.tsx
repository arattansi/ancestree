import type { ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cropStyle, type CropTransform } from "@/lib/image-crop";

/**
 * Their entry at a glance on the welcome (Step 50): photo or initials, name,
 * and what it says past the name, with room for one action beside it.
 */
export function EntrySummary({
  name,
  initials,
  line,
  photoUrl,
  crop,
  action,
}: {
  name: string;
  initials: string;
  /** What it says past the name (`enteredLine`), if anything. */
  line: string | null;
  photoUrl: string | null;
  crop: CropTransform;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-12">
        {photoUrl ? (
          <AvatarImage src={photoUrl} alt="" style={cropStyle(crop)} />
        ) : null}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{name}</p>
        {line ? (
          <p className="text-sm text-muted-foreground">{line}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
