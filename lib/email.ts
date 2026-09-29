import "server-only";

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "ancestree <no-reply@ancestree.space>";
/**
 * Resend normally answers in well under a second. Without a bound, an
 * unresponsive API would hang the server action that called us — and every
 * caller runs inside a button the admin is watching.
 */
const TIMEOUT_MS = 15_000;
/** The most Resend takes in one batch. */
const BATCH_MAX = 100;
/** How long to wait, at most, when Resend says it's being asked too fast. */
const MAX_RETRY_WAIT_MS = 2_000;

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export type SendEmailResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** Resend's answer, when it answered; none when it couldn't be reached. */
      status?: number;
    };

/**
 * Minimal Resend client for ancestree's own transactional email (currently:
 * invite-request approvals). Separate from Supabase Auth's SMTP config —
 * that only covers Supabase's own auth mail (magic link, confirm signup);
 * this sends app-authored messages through the same Resend account, reusing
 * the API key that was set as the SMTP password there.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  return postToResend(RESEND_API_URL, message(input));
}

/**
 * Several emails in one request (Step 77.5, audit S8): up to 100 in a batch,
 * each to its own address, so nobody sees another's. Answers in the order
 * given.
 *
 * A batch is all or nothing. One address Resend won't take refuses the lot,
 * so a refused batch goes again one by one, and each says for itself. One
 * that couldn't be reached isn't sent again: it may have gone, and twice is
 * worse than a Resend from Sent Invites.
 */
export async function sendEmails(
  inputs: SendEmailInput[],
): Promise<SendEmailResult[]> {
  if (inputs.length <= 1) return Promise.all(inputs.map(sendEmail));
  const results: SendEmailResult[] = [];
  for (let i = 0; i < inputs.length; i += BATCH_MAX) {
    const batch = inputs.slice(i, i + BATCH_MAX);
    const sent = await postToResend(`${RESEND_API_URL}/batch`, batch.map(message));
    if (sent.ok || sent.status !== 422) {
      results.push(...batch.map(() => sent));
      continue;
    }
    // One at a time, as Resend limits how fast a team may send.
    for (const input of batch) results.push(await sendEmail(input));
  }
  return results;
}

/**
 * Why an email didn't send, as a person is told it: an address Resend
 * refused, or nothing to add. Never Resend's own words, which carry its
 * internals and can repeat the address.
 */
export function whyNotSent(result: SendEmailResult): string | undefined {
  return !result.ok && result.status === 422
    ? "the address was refused"
    : undefined;
}

/**
 * A line for the logs when some of a send didn't go, or null when it all
 * did: how Resend answered, never its words, which can repeat an address.
 */
export function unsentSummary(results: SendEmailResult[]): string | null {
  const unsent = results.flatMap((r) => (r.ok ? [] : [r]));
  if (unsent.length === 0) return null;
  const [first] = unsent;
  const how = first.status ? `Resend ${first.status}` : first.error;
  return `${unsent.length} of ${results.length} didn't send — ${how}`;
}

function message(input: SendEmailInput) {
  return {
    from: process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
  };
}

/**
 * One request to Resend. Asked too fast, it waits as long as Resend says (up
 * to two seconds) and asks once more: nothing was sent the first time.
 */
async function postToResend(url: string, body: unknown): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }

  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        return { ok: false, error: "Resend did not respond in time" };
      }
      return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
    }

    if (res.ok) return { ok: true };
    if (res.status === 429 && attempt === 1) {
      const seconds = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000;
      await new Promise((resolve) => setTimeout(resolve, Math.min(wait, MAX_RETRY_WAIT_MS)));
      continue;
    }
    return {
      ok: false,
      status: res.status,
      error: `Resend ${res.status}: ${await res.text()}`,
    };
  }
}

/** Escape user-supplied text before interpolating it into an HTML email. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
