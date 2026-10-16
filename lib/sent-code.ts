import { isEmailAddress } from "@/lib/email-address";

/**
 * The sign-in code a form just emailed (Step 164), remembered for as long as
 * the code works, so reloading the page on "Check your email" opens on the
 * code box again rather than the empty form. Shared by the server's setters
 * (`lib/sent-code.server.ts`) and the tests.
 *
 * It holds the address the code went to, the name a sign-up typed, the link
 * it came through (a bare invite's token, a campaign's code) and when it was
 * sent: only a page for that same link opens on it, and only within the hour.
 * httpOnly, and forgotten once the code signs them in, they use another
 * email, or sign out.
 */
export const SENT_CODE_COOKIE = "ancestree.code-sent";

/** How long the code works: an hour, as the sign-in email says. */
export const SENT_CODE_SECONDS = 60 * 60;

export type SentCode = {
  email: string;
  firstName?: string;
  lastName?: string;
  inviteToken?: string;
  campaign?: string;
  sentAt: number;
};

/**
 * The link a page's form is for: a bare invite, a campaign, or neither; and
 * for an emailed invite (`SignInToAccept`, Step 165), the address it names.
 */
export type SentCodeLink = { inviteToken?: string; campaign?: string; email?: string };

export function sentCodeCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: SENT_CODE_SECONDS,
  };
}

export function sentCodeCookieValue(sent: SentCode): string {
  return JSON.stringify(sent);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * The code sent from this page's form, if the cookie holds one: for the
 * same link, sent within the hour. Anything else, or anything malformed,
 * is no code at all.
 */
export function readSentCode(
  raw: string | undefined,
  link: SentCodeLink,
  now: number = Date.now(),
): SentCode | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const value = parsed as Record<string, unknown>;

  const email = text(value.email);
  const sentAt = value.sentAt;
  if (!email || !isEmailAddress(email)) return null;
  if (typeof sentAt !== "number" || !Number.isFinite(sentAt)) return null;
  // Spent, or from a clock that ran ahead.
  if (now - sentAt >= SENT_CODE_SECONDS * 1000 || sentAt > now + 60_000) return null;

  const inviteToken = text(value.inviteToken);
  const campaign = text(value.campaign);
  if ((inviteToken ?? "") !== (link.inviteToken?.trim() ?? "")) return null;
  if ((campaign ?? "") !== (link.campaign?.trim() ?? "")) return null;
  if (link.email && email.trim().toLowerCase() !== link.email.trim().toLowerCase()) {
    return null;
  }

  return {
    email,
    firstName: text(value.firstName),
    lastName: text(value.lastName),
    inviteToken,
    campaign,
    sentAt,
  };
}
