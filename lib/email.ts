import "server-only";

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "ancestree <no-reply@ancestree.space>";
/**
 * Resend normally answers in well under a second. Without a bound, an
 * unresponsive API would hang the server action that called us — and every
 * caller runs inside a button the admin is watching.
 */
const TIMEOUT_MS = 15_000;

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export type SendEmailResult = { ok: true } | { ok: false; error: string };

/**
 * Minimal Resend client for ancestree's own transactional email (currently:
 * invite-request approvals). Separate from Supabase Auth's SMTP config —
 * that only covers Supabase's own auth mail (magic link, confirm signup);
 * this sends app-authored messages through the same Resend account, reusing
 * the API key that was set as the SMTP password there.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { ok: false, error: "Resend did not respond in time" };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
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
