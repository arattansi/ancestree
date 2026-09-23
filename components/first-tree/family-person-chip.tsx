import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { FamilyCard } from "@/lib/first-tree";
import { cn } from "@/lib/utils";

/**
 * One person in the first run's little family tree (Step 29): their photo
 * or initials, name and years. The founder's own is outlined in the Root's
 * colour, since everyone else hangs from it.
 */
export function FamilyPersonChip({
  person,
  highlight = false,
  note,
  className,
}: {
  person: FamilyCard;
  highlight?: boolean;
  /** A word under the name in place of the years, e.g. "Waiting for a yes". */
  note?: string;
  className?: string;
}) {
  const detail = note ?? person.lifespan ?? "Living";
  return (
    <div
      className={cn(
        "flex w-44 min-w-0 items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2 text-left shadow-xs",
        highlight
          ? "border-account-root/50 ring-2 ring-account-root/20"
          : "border-border",
        className,
      )}
    >
      <Avatar>
        {person.photoUrl ? (
          <AvatarImage src={person.photoUrl} alt="" />
        ) : null}
        <AvatarFallback>{person.initials}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground">
          {person.name}
        </span>
        <span className="truncate text-xs text-muted-foreground">{detail}</span>
      </div>
    </div>
  );
}
