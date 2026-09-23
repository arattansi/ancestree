import { Check, Minus } from "lucide-react";

import {
  ACCOUNT_TYPE_TONE,
  AccountTypeGlyph,
} from "@/components/account-type-badge";
import {
  ACCOUNT_TYPES,
  describeAccess,
  type AccountType,
} from "@/lib/account-types";
import { cn } from "@/lib/utils";

/**
 * One account type, spelled out: its mark, name and line, who it's for, and
 * what it can do — everything read off `lib/account-types`, so the card can't
 * promise what the model doesn't say.
 */
export function AccountTypeCard({
  type,
  current = false,
  className,
}: {
  type: AccountType;
  /** Mark it as the viewer's own. */
  current?: boolean;
  className?: string;
}) {
  return (
    <article
      aria-label={`${type.name} account`}
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border p-4",
        className,
      )}
    >
      <header className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md border",
            ACCOUNT_TYPE_TONE[type.key],
          )}
        >
          <AccountTypeGlyph type={type} className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h3 className="flex items-center gap-2 font-medium text-foreground">
            {type.name}
            {current ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                You
              </span>
            ) : null}
          </h3>
          <p className="text-xs text-muted-foreground">{type.tagline}</p>
        </div>
      </header>
      <p className="text-sm text-muted-foreground">{type.description}</p>
      {/* Pinned to the bottom so side-by-side cards line their lists up. */}
      <dl className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
        {describeAccess(type).map((a) => (
          <div key={a.label} className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">{a.label}</dt>
            <dd className="text-right font-medium text-foreground">
              {a.value === true ? (
                <>
                  <Check aria-hidden className="size-4 text-canopy" />
                  <span className="sr-only">Yes</span>
                </>
              ) : a.value === false ? (
                <>
                  <Minus aria-hidden className="size-4 text-muted-foreground" />
                  <span className="sr-only">No</span>
                </>
              ) : (
                a.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

/** Every account type side by side, from the ground up. */
export function AccountTypeGuide({ currentRole }: { currentRole?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ACCOUNT_TYPES.map((type) => (
        <AccountTypeCard
          key={type.key}
          type={type}
          current={type.key === currentRole}
        />
      ))}
    </div>
  );
}
