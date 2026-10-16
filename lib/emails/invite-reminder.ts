import { escapeHtml } from "@/lib/email";
import {
  INVITE_FOOTNOTE_HTML,
  inviteEmailSubject,
  oneLine,
  renderEmail,
  treeNameHtml,
} from "@/lib/emails/shared";
import type { ReminderStage } from "@/lib/invite-reminders";
import { treeInSentence } from "@/lib/tree-names";

/**
 * A reminder to someone invited who hasn't joined yet (Step 163), with the
 * same link: on day 5 under the invite's own subject, so it lands with the
 * first email; on day 25 saying when it runs out. It names the inviter, the
 * tree and the entry waiting for them, as the invite did.
 */
export function inviteReminderEmail(input: {
  stage: ReminderStage;
  /** None for a child's placeholder (Step 98.3), or a record with none. */
  firstName: string | null;
  inviterName: string;
  treeName: string;
  /** The entry a claim invite names. */
  entryName: string | null;
  placeholder: boolean;
  /** Whole days before the link lapses (`daysLeft`). */
  daysLeft: number;
  /** Our own https://…/join/<token> URL. */
  url: string;
}): { subject: string; html: string } {
  const inviterName = escapeHtml(input.inviterName);
  const treeName = treeNameHtml(input.treeName);
  const firstName =
    input.firstName && !input.placeholder ? escapeHtml(input.firstName) : null;
  const days = input.daysLeft === 1 ? "1 day" : `${input.daysLeft} days`;

  const invited = input.placeholder
    ? `${inviterName} has kept a place for you on ${treeName} on ancestree.`
    : input.entryName
      ? `${inviterName} added you to ${treeName} on ancestree, where an entry
                  for <strong style="color:#0a0a0a;">${escapeHtml(input.entryName)}</strong>
                  is waiting for you to claim.`
      : `${inviterName} invited you to ${treeName} on ancestree.`;
  const when =
    input.stage === 1
      ? `The link below still signs you straight in, for ${days} more.`
      : `The link below still signs you straight in, but it expires in ${days}.`;

  const html = renderEmail({
    title: "You&rsquo;re still invited to ancestree",
    preheader: `Your invite to ${treeName} works for ${days} more.`,
    heading: firstName
      ? `You&rsquo;re still invited, ${firstName}`
      : "You&rsquo;re still invited",
    bodyHtml: `${invited} ${when}`,
    cta: { label: "join ancestree", url: input.url },
    footnoteHtml: INVITE_FOOTNOTE_HTML,
  });

  const subject =
    input.stage === 1
      ? inviteEmailSubject({
          inviterName: input.inviterName,
          treeName: input.treeName,
          claim: Boolean(input.entryName),
        })
      : `Your invite to ${oneLine(treeInSentence(input.treeName))} expires in ${days}`;
  return { subject, html };
}
