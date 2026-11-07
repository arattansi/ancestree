/**
 * Counting when the weekly newsletter is opened, only for members who say
 * yes (Step 226). France's CNIL (deliberation 2026-042, §3.1) puts the
 * opening rate behind prior consent, and inaction is a refusal (§4.2), so it
 * is off until they turn it on, and the issue asks once, again after six
 * months at most. Pure, so it's tested without a server.
 */

/** About six months: no sooner than this does the newsletter ask again. */
export const OPENS_ASK_AGAIN_DAYS = 183;

/** What the newsletter keeps of a member's say on it. */
export type OpensState = {
  count_opens: boolean;
  /** When the newsletter last asked, or null if it never has. */
  opens_asked_at: string | null;
};

/**
 * Whether this issue asks them to say yes: not once they have, and not
 * again until six months after the last time it asked.
 */
export function shouldAskOpens(state: OpensState | undefined, now: Date): boolean {
  if (state?.count_opens) return false;
  if (!state?.opens_asked_at) return true;
  const asked = Date.parse(state.opens_asked_at);
  if (Number.isNaN(asked)) return true;
  return now.getTime() - asked >= OPENS_ASK_AGAIN_DAYS * 86_400_000;
}

/**
 * What an issue says on counting opens, for one reader (Step 226): the ask,
 * or the notice that it's counting with the way to stop.
 */
export type IssueOpens =
  | { kind: "ask"; url: string }
  | { kind: "counting"; stopUrl: string; pixelUrl?: string };

/**
 * What one reader's copy of an issue does about opens: asks (they've never
 * been, or not for six months), counts (they said yes; with an image only
 * when `withPixels`, a send that records its key), or nothing. When their say
 * couldn't be read (`state` is null), nothing is asked and nothing counted.
 */
export function opensForIssue(input: {
  /** Their say, `undefined` for a member with none on record, null when
   *  the lot couldn't be read. */
  state: OpensState | undefined | null;
  now: Date;
  withPixels: boolean;
  /** The newsletter's page at its box for opens. */
  opensUrl: string;
  pixelUrl: (key: string) => string;
  newKey: () => string;
}): { opens?: IssueOpens; key?: string; asked: boolean } {
  const { state, now, withPixels } = input;
  if (state === null) return { asked: false };
  if (state?.count_opens) {
    const key = withPixels ? input.newKey() : undefined;
    return {
      opens: {
        kind: "counting",
        stopUrl: input.opensUrl,
        pixelUrl: key ? input.pixelUrl(key) : undefined,
      },
      key,
      asked: false,
    };
  }
  if (shouldAskOpens(state, now)) {
    return { opens: { kind: "ask", url: input.opensUrl }, asked: true };
  }
  return { asked: false };
}

const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A copy's key: the UUID its image's address carries. */
export function isOpenKey(value: unknown): value is string {
  return typeof value === "string" && KEY.test(value);
}

/**
 * The image itself: one transparent pixel, a GIF of 43 bytes. Mail apps
 * show nothing; the load is the count.
 */
export const PIXEL_GIF_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
