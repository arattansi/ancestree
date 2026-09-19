import { Badge } from "@/components/ui/badge";
import {
  accountTypeOf,
  type AccountType,
  type AccountTypeKey,
} from "@/lib/account-types";
import { cn } from "@/lib/utils";

/**
 * The account types' marks (Step 18): a trunk splitting into roots, a limb in
 * leaf, a spreading crown, a single leaf. Drawn on lucide's 24px grid
 * and 2px stroke so they sit beside the app's other icons, and in
 * `currentColor` so each takes its type's colour from the text around it.
 */
const GLYPHS: Record<AccountTypeKey, React.ReactNode> = {
  admin: (
    <>
      <path d="M12 2v7" />
      <path d="M12 9c0 3-2 5-5 6.5-1.5.8-2.5 2-3 3.5" />
      <path d="M12 9c0 3 2 5 5 6.5 1.5.8 2.5 2 3 3.5" />
      <path d="M12 9v12" />
      <path d="M7 15.5c.3 1.8 0 3.5-1 5" />
      <path d="M17 15.5c-.3 1.8 0 3.5 1 5" />
    </>
  ),
  branch_admin: (
    <>
      <path d="M3 20c6-2 11-6 14-12" />
      <path d="M9.5 16.5c.5-3 0-5.5-1.5-8" />
      <path d="M17 8a3.2 3.2 0 0 1 4-4 3.2 3.2 0 0 1-4 4Z" />
      <path d="M8 8.5a3 3 0 0 1-3-4 3 3 0 0 1 3 4Z" />
    </>
  ),
  member: (
    <>
      <path d="M4.85 14.5A4 4 0 0 1 7.02 7.53a5 5 0 0 1 9.96 0 4 4 0 0 1 2.17 6.97Z" />
      <path d="M12 14.5V21" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14Z" />
      <path d="m3 21 11-11" />
    </>
  ),
};

/** The type's colour, for a mark standing on its own. */
const ACCOUNT_TYPE_INK: Record<AccountTypeKey, string> = {
  admin: "text-account-root",
  branch_admin: "text-account-branch",
  member: "text-account-canopy",
  leaf: "text-account-leaf",
};

/** Text, tint and border in the type's own colour. */
export const ACCOUNT_TYPE_TONE: Record<AccountTypeKey, string> = {
  admin: "border-account-root/30 bg-account-root/10 text-account-root",
  branch_admin:
    "border-account-branch/30 bg-account-branch/10 text-account-branch",
  member: "border-account-canopy/30 bg-account-canopy/10 text-account-canopy",
  leaf: "border-account-leaf/30 bg-account-leaf/10 text-account-leaf",
};

export function AccountTypeGlyph({
  type,
  tinted = false,
  className,
}: {
  type: AccountType;
  /** Draw it in the type's colour rather than the surrounding text's. */
  tinted?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn(
        "size-4 shrink-0",
        tinted && ACCOUNT_TYPE_INK[type.key],
        className,
      )}
    >
      {GLYPHS[type.key]}
    </svg>
  );
}

/** A member's account type, as a coloured chip: mark and name. */
export function AccountTypeBadge({
  role,
  className,
}: {
  role: string | null | undefined;
  className?: string;
}) {
  const type = accountTypeOf(role);
  return (
    <Badge
      variant="outline"
      className={cn(ACCOUNT_TYPE_TONE[type.key], className)}
    >
      <AccountTypeGlyph type={type} />
      {type.name}
    </Badge>
  );
}
