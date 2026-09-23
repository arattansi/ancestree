/**
 * The name-and-address forms anyone can fill in without signing in: asking
 * to join a tree, looking for your family's tree first, and the waitlist to
 * start one (Step 28). One reading of them, so each says the same thing
 * about a bad entry.
 */

/** What "request access" says before anything is typed, in its dialog or on its page. */
export const REQUEST_ACCESS_INTRO =
  "ancestree is invite-only. Tell us who you are, and we’ll look for your family’s tree.";

/**
 * What asking to join one tree says first: the share link's "Ask to join"
 * dialog, and `/request-invite?tree=` (Step 41.4).
 */
export const REQUEST_INVITE_INTRO =
  "ancestree is invite-only. Tell us who you are and an admin will review your request.";

export const MAX_NAME_LENGTH = 80;
/** The most an address can be (RFC 5321's path limit, less the brackets). */
export const MAX_EMAIL_LENGTH = 254;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type NameAndEmail = {
  firstName: string;
  lastName: string;
  email: string;
};

/** Which of the fields a problem is with, so the form can mark it. */
export type RequestField = "name" | "email";

export type NameAndEmailProblem = { field: RequestField; message: string };

/**
 * What every one of these forms hands back: the entry as typed, to show
 * again, and what went wrong, if anything did.
 */
export type RequestFormState = Partial<NameAndEmail> & {
  error?: string;
  /** Set when the error is with a field rather than, say, the server. */
  errorField?: RequestField;
};

/** What's wrong with an entry, in the words the form shows; `null` when nothing is. */
export function nameAndEmailProblem({
  firstName,
  lastName,
  email,
}: NameAndEmail): NameAndEmailProblem | null {
  if (!firstName || !lastName) {
    return { field: "name", message: "Enter your first and last name." };
  }
  if (firstName.length > MAX_NAME_LENGTH || lastName.length > MAX_NAME_LENGTH) {
    return { field: "name", message: "That name is too long." };
  }
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return { field: "email", message: "Enter a valid email address." };
  }
  return null;
}

/**
 * The entry as typed — names trimmed, the address trimmed and lower-cased —
 * and what's wrong with it. The entry comes back either way, so a form can
 * show it again beside the error.
 */
export function readNameAndEmail(formData: FormData): {
  entered: NameAndEmail;
  problem: NameAndEmailProblem | null;
} {
  const entered = {
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
  };
  return { entered, problem: nameAndEmailProblem(entered) };
}

/** A problem as a form state carries it. */
export function problemState(
  problem: NameAndEmailProblem,
  entered: NameAndEmail,
): RequestFormState {
  return { error: problem.message, errorField: problem.field, ...entered };
}

/**
 * Whether an address, already trimmed and lower-cased, passes the check
 * these forms give theirs — for another address on one of them, like a
 * relative's (Step 30.5).
 */
export function isEmailAddress(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(email);
}
