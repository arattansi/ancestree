/**
 * The code in a sign-in email (Step 53), which replaced the link: typed,
 * pasted or autofilled on the page that sent it, so nothing in the email
 * signs anyone in when a mail scanner opens it (Step 20).
 */

/**
 * How many digits the code has: the hosted project's OTP length
 * (`mailer_otp_length`, Authentication → Sign In / Providers → Email). Keep
 * the two equal, or the box stops short of the code or waits for digits that
 * never come.
 */
export const SIGN_IN_CODE_LENGTH = 8;

/**
 * What was typed or pasted, as the code: its digits, however they were
 * spaced ("1234 5678", "1234-5678", a line copied from the email), cut to
 * the code's length.
 */
export function readSignInCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, SIGN_IN_CODE_LENGTH);
}

/** Whether `code` is all of a code, ready to check. */
export function isWholeSignInCode(code: string): boolean {
  return code.length === SIGN_IN_CODE_LENGTH && /^\d+$/.test(code);
}

/**
 * What the code box says when Supabase Auth refuses a code, by its error
 * code: `otp_expired` covers a wrong code as well as a stale one.
 */
export function signInCodeRefusal(errorCode: string | undefined): string {
  if (errorCode === "over_request_rate_limit") {
    return "Too many tries. Wait a few minutes, then try again.";
  }
  return "That code is wrong or has expired.";
}

/** What a form says when a code couldn't be sent, by Supabase Auth's error code. */
export function sendCodeRefusal(errorCode: string | undefined): string {
  if (errorCode === "over_email_send_rate_limit") {
    return "Wait a minute before asking for another code.";
  }
  return "Could not send the code. Try again shortly.";
}
