import { readBlogKind, readBlogPeople, type BlogKind, type BlogPerson } from "@/lib/blog";
import { isEmailAddress, MAX_EMAIL_LENGTH } from "@/lib/email-address";
import {
  BLOG_TITLE_MAX,
  LIBRARY_CHANGE_MAX,
  LIBRARY_SUBMISSION_BODY_MAX,
  LIBRARY_SUBMISSION_WORDS_MAX,
} from "@/lib/limits";

/**
 * Stories sent in to the library (Step 157): anyone may send the story of
 * someone who has passed from /library/submit, with the draft form's
 * fields (no preview, no meta fields), their email, and their agreement
 * that it may be edited to fit. A copy is emailed back; its link opens
 * what was sent and asks for a change, which the beta reviewers triage on
 * the admin page's blog tab with the story itself. Pure, for the form,
 * the pages, the actions and their tests.
 */

/** new: waiting; drafted: a reviewer made it a post; closed: set aside. */
export const SUBMISSION_STATUSES = ["new", "drafted", "closed"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** A change asked for from the copy's page. */
export type ChangeRequest = {
  id: string;
  message: string;
  /** When a reviewer saw to it, or `null` while it waits. */
  resolvedAt: string | null;
  createdAt: string;
};

/** A story sent in, as a reviewer triages it. */
export type LibrarySubmission = {
  id: string;
  email: string;
  title: string;
  /** As typed: Markdown once it's a post. */
  body: string;
  kind: BlogKind;
  people: BlogPerson[];
  /** Its photo, signed for an hour, or `null` when none was sent. */
  photoUrl: string | null;
  status: SubmissionStatus;
  /** The post made from it, if there is one still. */
  post: { id: string; slug: string; publishedAt: string | null } | null;
  createdAt: string;
  changeRequests: ChangeRequest[];
};

/** A story sent in, as the sender's copy shows it. */
export type SentStory = {
  title: string;
  body: string;
  kind: BlogKind;
  people: BlogPerson[];
  photoUrl: string | null;
  createdAt: string;
  /** The post's address once it's published. */
  publishedSlug: string | null;
  changeRequests: ChangeRequest[];
};

/** `status` as stored, or "new" for anything else. */
export function readSubmissionStatus(raw: unknown): SubmissionStatus {
  return typeof raw === "string" && (SUBMISSION_STATUSES as readonly string[]).includes(raw)
    ? (raw as SubmissionStatus)
    : "new";
}

/** The changes asked for, as `list_library_submissions` hands them; anything else is none. */
export function readChangeRequests(raw: unknown): ChangeRequest[] {
  if (!Array.isArray(raw)) return [];
  const out: ChangeRequest[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.message !== "string") continue;
    if (typeof r.createdAt !== "string") continue;
    out.push({
      id: r.id,
      message: r.message,
      resolvedAt: typeof r.resolvedAt === "string" ? r.resolvedAt : null,
      createdAt: r.createdAt,
    });
  }
  return out;
}

/** Whether a change asked for is still waiting on one of them. */
export function hasChangeWaiting(requests: ChangeRequest[]): boolean {
  return requests.some((r) => r.resolvedAt === null);
}

/** A person's name as a story names them: first and last. */
export function personName(person: BlogPerson): string {
  return [person.first, person.last].filter(Boolean).join(" ");
}

/** Who a story is about, each in full: "A", "A and B", "A, B and C". */
export function peopleNames(people: BlogPerson[]): string {
  const names = people.map(personName).filter(Boolean);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * How many words `text` has: runs of anything but spaces with a letter or
 * a digit in them, so a dash or an ampersand on its own isn't one.
 */
export function countWords(text: string): number {
  return (text.match(/\S+/g) ?? []).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export type SubmissionFields =
  | {
      ok: true;
      email: string;
      title: string;
      body: string;
      kind: BlogKind;
      people: BlogPerson[];
    }
  | { ok: false; error: string };

/**
 * A story sent in, as typed, checked and trimmed: someone named, a title,
 * the story, a working email, and the box ticked to agree it may be
 * edited.
 */
export function readSubmissionFields(input: {
  email: unknown;
  title: unknown;
  body: unknown;
  kind: unknown;
  people: unknown;
  agreed: unknown;
}): SubmissionFields {
  const title =
    typeof input.title === "string" ? input.title.trim().replace(/\s+/g, " ") : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const people = readBlogPeople(input.people);

  if (!people.length) return { ok: false, error: "Give their name." };
  if (!title) return { ok: false, error: "Give it a title." };
  if (title.length > BLOG_TITLE_MAX) {
    return { ok: false, error: `Keep the title under ${BLOG_TITLE_MAX} characters.` };
  }
  if (!body) return { ok: false, error: "Write their story." };
  const words = countWords(body);
  if (words > LIBRARY_SUBMISSION_WORDS_MAX) {
    return {
      ok: false,
      error: `Too long by ${(words - LIBRARY_SUBMISSION_WORDS_MAX).toLocaleString("en")} ${words - LIBRARY_SUBMISSION_WORDS_MAX === 1 ? "word" : "words"}.`,
    };
  }
  if (body.length > LIBRARY_SUBMISSION_BODY_MAX) {
    return {
      ok: false,
      error: `Too long by ${(body.length - LIBRARY_SUBMISSION_BODY_MAX).toLocaleString("en")} characters.`,
    };
  }
  if (!email || email.length > MAX_EMAIL_LENGTH || !isEmailAddress(email)) {
    return { ok: false, error: "Enter your email address." };
  }
  if (input.agreed !== true && input.agreed !== "1" && input.agreed !== "on") {
    return { ok: false, error: "Agree to it being edited to send it." };
  }
  return { ok: true, email, title, body, kind: readBlogKind(input.kind), people };
}

/** A change asked for, as typed and trimmed. */
export function readChangeMessage(
  raw: unknown,
): { ok: true; message: string } | { ok: false; error: string } {
  const message = typeof raw === "string" ? raw.trim() : "";
  if (!message) return { ok: false, error: "Say what should change." };
  if (message.length > LIBRARY_CHANGE_MAX) {
    return { ok: false, error: `Keep it under ${LIBRARY_CHANGE_MAX.toLocaleString("en")} characters.` };
  }
  return { ok: true, message };
}

/** What a refusal from `submit_library_story` or `ask_library_change` says to the sender. */
export function submissionRefusal(message: string | undefined): string | null {
  if (!message) return null;
  if (message.includes("TOO_MANY_FROM_ADDRESS")) {
    return "That’s three stories from this address today. Send the next one tomorrow.";
  }
  if (message.includes("TOO_MANY_TODAY")) {
    return "Too many stories came in today. Try again tomorrow.";
  }
  if (message.includes("TOO_MANY_CHANGES")) {
    return "Ten changes are waiting already. Ask again once they’re seen to.";
  }
  if (message.includes("NO_SUBMISSION")) return "This link doesn’t work.";
  return null;
}
