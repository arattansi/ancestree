import { escapeHtml } from "@/lib/email";
import { renderEmail } from "@/lib/emails/shared";

/**
 * "You can start your tree" — sent by `approveTreeRequest` when a reviewer
 * says yes to a member's request to start a tree (Step 26). Not an invite:
 * the button only opens the page where they name it, and signs nobody in,
 * so it can be opened any number of times.
 */
export function treeRequestApprovedEmail(input: {
  firstName: string;
  reviewerName: string;
  url: string;
}): { subject: string; html: string } {
  const firstName = escapeHtml(input.firstName);
  const reviewerName = escapeHtml(input.reviewerName);

  const html = renderEmail({
    title: "You can start your tree on ancestree",
    preheader: "Your request to start a tree of your own was approved.",
    heading: `You can start your tree, ${firstName}`,
    bodyHtml: `${reviewerName} approved your request to start a family tree
                  of your own on ancestree. Name it and you&rsquo;re its first
                  Root &mdash; then bring along anyone you can already see on
                  your other trees.`,
    cta: { label: "Start your tree", url: input.url },
    footnoteHtml: `You asked to start a tree on ancestree. If you&rsquo;re
                  signed out, sign in with this address first.`,
  });

  return { subject: "You can start your tree on ancestree", html };
}
