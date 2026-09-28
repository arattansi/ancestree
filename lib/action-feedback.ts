/**
 * What a button says when its server action answers (Step 70). The pieces
 * `useAction` (components/use-action.ts) builds on, kept pure for tests.
 */

/**
 * The message for an action whose call threw rather than answered: the
 * network dropped, or the page is older than the server (a deploy since it
 * loaded) and the action it calls no longer exists. Reloading fixes both.
 */
export const UNREACHABLE =
  "Couldn't reach the server — reload the page and try again.";

/** How long an error toast stays up: long enough to read twice (sonner's own is 4 s). */
export const ERROR_TOAST_MS = 10_000;

/**
 * Whether a server action's call threw because the action redirected. In
 * Next 16.3 the caller's promise rejects with the redirect while the router
 * goes there by itself (server-action-reducer.js), so it's no failure. The
 * shape is Next's own `isRedirectError`, which isn't public: a digest of
 * `NEXT_REDIRECT;push|replace;<url>;<status>;`.
 */
export function isRedirect(thrown: unknown): boolean {
  if (typeof thrown !== "object" || thrown === null || !("digest" in thrown)) {
    return false;
  }
  const digest = (thrown as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  const [code, type] = digest.split(";");
  return code === "NEXT_REDIRECT" && (type === "push" || type === "replace");
}

/**
 * The error an action's answer carries, if any. The app's actions answer
 * `{ error }` when they refuse, and nothing, `{}` or data when they work; a
 * blank error counts as none.
 */
export function actionError(result: unknown): string | null {
  if (!result || typeof result !== "object" || !("error" in result)) {
    return null;
  }
  const error = (result as { error?: unknown }).error;
  return typeof error === "string" && error.trim() !== "" ? error : null;
}
