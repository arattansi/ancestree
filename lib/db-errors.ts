/**
 * Saying what a database refusal means (Step 77.4, audit R5). Each action
 * lists what it may be told and how to say it; a refusal it doesn't list
 * gets its fallback, and no message at all gets `SOMETHING_WENT_WRONG`.
 * Lists compose by spreading one into another.
 */

/**
 * A text the refusal contains (any case) or a test of the whole message,
 * and what to say when it matches.
 */
export type ErrorRule = readonly [
  match: string | ((message: string) => boolean),
  said: string,
];

export const SOMETHING_WENT_WRONG = "Something went wrong. Try again.";

/**
 * What Postgres says when row-level security refuses an insert: the caller
 * may not write that row. (An update or delete it filters out says nothing
 * at all; `ownedWrite` catches those.)
 */
export const RLS_REFUSED = "row-level security";

/** The first rule the message matches says it; the fallback otherwise. */
export function friendlyDbError(
  message: string | null | undefined,
  rules: readonly ErrorRule[],
  fallback: string,
): string {
  if (!message) return SOMETHING_WENT_WRONG;
  const lower = message.toLowerCase();
  for (const [match, said] of rules) {
    const matched =
      typeof match === "string"
        ? lower.includes(match.toLowerCase())
        : match(message);
    if (matched) return said;
  }
  return fallback;
}

/**
 * A write row-level security may quietly skip (Step 77.4, audit R5): an
 * UPDATE or DELETE it doesn't allow touches no row and reports no error,
 * which used to read as success. So the write asks for its rows back — it
 * must end in `.select(…)` — and none back means `refused`: not theirs, or,
 * for a write filtered by status too, already answered. `failed` says what
 * an error means, from its message when it's a function.
 */
export async function ownedWrite<R>(
  write: PromiseLike<{ data: R[] | null; error: { message: string } | null }>,
  {
    refused,
    failed,
  }: { refused: string; failed: string | ((message: string) => string) },
): Promise<{ rows: R[]; error?: undefined } | { rows?: undefined; error: string }> {
  const { data, error } = await write;
  if (error) {
    return { error: typeof failed === "string" ? failed : failed(error.message) };
  }
  if (!data || data.length === 0) return { error: refused };
  return { rows: data };
}
