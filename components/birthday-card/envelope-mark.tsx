import { cn } from "@/lib/utils";

/**
 * A small kraft envelope tied with twine (Step 217): a birthday card is going
 * round for someone. Beside their card on the tree, by the sheet's card
 * section, never on the person's own.
 */
export function EnvelopeMark({
  className,
  label,
}: {
  className?: string;
  /** Said to a screen reader; none hides it from one. */
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 40 28"
      className={cn("h-[21px] w-[30px] shrink-0", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <rect x="1" y="1" width="38" height="26" rx="2" className="fill-kraft stroke-kraft-line" />
      <path d="M1,2 L20,16 L39,2" fill="none" className="stroke-kraft-line" />
      <path d="M20,1 L20,27 M1,15 L39,15" className="stroke-twine" strokeWidth={1.6} />
      <path
        d="M20,15 C15,10 10,10 11,14 C12,17 17,17 20,15 C25,10 30,10 29,14 C28,17 23,17 20,15"
        fill="none"
        className="stroke-twine"
        strokeWidth={1.4}
      />
    </svg>
  );
}
