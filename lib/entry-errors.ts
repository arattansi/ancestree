import { OWN_LINE_REFUSAL, isOwnLineRefusal } from "@/lib/account-types";
import { friendlyDbError, RLS_REFUSED, type ErrorRule } from "@/lib/db-errors";

/**
 * What a refused write to an entry says: shared by the entry and connection
 * actions (`app/actions/people.ts`, `connections.ts`), which, being "use
 * server" files, can only share functions they export as actions.
 */

export const NO_PERMISSION = "You don't have permission to make that change.";

/** What a refused write to an entry says, by the database's reason. */
export const ENTRY_RULES: readonly ErrorRule[] = [
  [isOwnLineRefusal, OWN_LINE_REFUSAL],
  ["already exists", "Your own entry already exists."],
  [RLS_REFUSED, NO_PERMISSION],
];

export function friendlyEntryError(message: string | undefined): string {
  return friendlyDbError(
    message,
    ENTRY_RULES,
    "Couldn't save this entry. Check the fields and try again.",
  );
}
