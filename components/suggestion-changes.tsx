import type { SuggestionRow } from "@/lib/suggestions";

/**
 * A suggested change, a detail at a time (Step 67): what the entry says,
 * struck through, then what's suggested. Shown on the entry's card and in
 * the notice that asks for an answer.
 */
export function SuggestionChanges({ rows }: { rows: SuggestionRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        The entry already says this.
      </p>
    );
  }
  return (
    <dl className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <div key={row.detail} className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium text-muted-foreground">
            {row.label}
          </dt>
          <dd className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
            {row.from ? (
              <>
                <del className="text-muted-foreground">{row.from}</del>
                <span aria-hidden className="text-muted-foreground">
                  →
                </span>
              </>
            ) : null}
            {row.to ? (
              <ins className="font-medium no-underline">{row.to}</ins>
            ) : (
              <span className="text-muted-foreground italic">None</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
