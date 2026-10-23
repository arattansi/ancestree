import { isNoEmailAddress } from "@/lib/no-email";

/** The most an address can be (RFC 5321's path limit, less the brackets). */
export const MAX_EMAIL_LENGTH = 254;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Whether an address, already trimmed, reads as one: something, an @,
 * something with a dot in it, no spaces, and not too long. The one check
 * every form and action gives an address (Step 77.4, audit R4); the email
 * service has the last word. Never the address of an account with no email
 * (Step 202): nothing may sign in by it, invite it or send to it.
 */
export function isEmailAddress(email: string): boolean {
  return (
    email.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(email) && !isNoEmailAddress(email)
  );
}
