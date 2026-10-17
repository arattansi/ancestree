/**
 * The account Apple's reviewers sign in with (Step 176). App Review can't
 * read an emailed code, so the phone asks this one address for a password
 * instead (`signInWithPassword`). Every other account keeps the random
 * password Supabase gave it at sign-up, which nobody knows, and signs in
 * with a code. `npm run review:account` makes the account, its password and
 * its invented family; the password lives only in App Store Connect.
 *
 * Both addresses are Resend's test inbox, which takes mail and drops it, so
 * nothing sent to them bounces.
 */
export const APP_REVIEW_EMAIL = "delivered+app-review@resend.dev";

/**
 * The review tree's second Root, who never signs in: deleting the review
 * account hands the tree to them, as it would for any family.
 */
export const APP_REVIEW_STEWARD_EMAIL = "delivered+app-review-steward@resend.dev";

/** Whether an address, as typed, is the review account's. */
export function isAppReviewEmail(email: string): boolean {
  return email.trim().toLowerCase() === APP_REVIEW_EMAIL;
}
